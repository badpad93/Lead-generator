-- Backfill the workflow_template_stages rows the admin editor wrote
-- with the wrong shape.
--
-- Root cause: the editor had two adjacent text inputs (stage_name
-- and stage_key). Admins kept typing the human label into the
-- stage_key box while leaving stage_name at either its "New Stage"
-- placeholder OR whatever garbage happened to be in the state
-- (concatenation artifacts like 'startedStarted'). Either way the
-- key holds the real label and the name doesn't.
--
-- Post-fix, the API always slugifies stage_key from stage_name
-- server-side and the UI has no stage_key input. This migration
-- heals rows written before that landed.
--
-- Statement ordering matters. Statements execute in the migration
-- transaction in declaration order, each UPDATE fully committing
-- its writes to visible state before the next statement reads.
-- Two ordering invariants keep the backfill from destroying data:
--
--   * PROMOTE must run BEFORE SLUGIFY so the "human label in the
--     key" text is captured into stage_name before the key is
--     rewritten.
--   * DERIVE must run BEFORE SLUGIFY too. Rows that landed with an
--     already-clean key AND stage_name = 'New Stage' (bucket C:
--     'onboarding', 'test', 'testing') would otherwise get their
--     key slugified from the placeholder to 'new_stage' — losing
--     the only remaining signal of what the stage was.
--
-- Sequence (5 statements against template stages + workflow_stages):
--
--   1. PROMOTE   template_stages + workflow_stages
--   2. DERIVE    template_stages   (reads pre-slugified key)
--   3. SLUGIFY   template_stages   (now every stage_name is real)
--   4. MIRROR key + name           (workflow_stages inherits from template)
--
-- Idempotent: PROMOTE no-ops on slugified keys, DERIVE no-ops on
-- rows no longer named 'New Stage', SLUGIFY short-circuits when
-- the key already matches, MIRROR no-ops when values already match.
--
-- Expected end state:
--   - zero custom-template stages with stage_name = 'New Stage'
--   - zero custom-template stage_key values matching [[:space:][:upper:]]
--   - 'Finish setting up lead' preserved on its template as stage_name
--     (key becomes finish_setting_up_lead)

-- ─── Step 1: PROMOTE key -> name ──────────────────────────────────
-- For every custom-template stage whose key looks like a human
-- label (contains a space or an uppercase letter), copy the key
-- value into stage_name. Runs regardless of the incumbent name —
-- those rows either hold 'New Stage' or a garbage concatenation
-- and neither is worth preserving.

UPDATE workflow_template_stages ts
   SET stage_name = ts.stage_key
  FROM workflow_templates t
 WHERE ts.template_id = t.id
   AND t.is_custom = true
   AND ts.stage_key ~ '[[:space:][:upper:]]';

UPDATE workflow_stages s
   SET stage_name = s.stage_key
  FROM workflow_template_stages ts
  JOIN workflow_templates t ON t.id = ts.template_id
 WHERE s.template_stage_id = ts.id
   AND t.is_custom = true
   AND s.stage_key ~ '[[:space:][:upper:]]';

-- ─── Step 2: DERIVE name from key (template stages) ───────────────
-- Rows still named 'New Stage' after PROMOTE had keys that were
-- already clean-looking ('onboarding', 'test'). The typed original
-- is unrecoverable; titlecase the key as the best available
-- fallback. MUST run before SLUGIFY so we read the intent-carrying
-- key BEFORE it gets rewritten.
--
-- Guard: skip rows whose key has no alphanumeric character at all
-- (would produce an empty or all-punctuation stage_name). Those
-- rows keep 'New Stage' so an admin sees the failure and fixes it
-- by hand.

UPDATE workflow_template_stages ts
   SET stage_name = initcap(replace(ts.stage_key, '_', ' '))
  FROM workflow_templates t
 WHERE ts.template_id = t.id
   AND t.is_custom = true
   AND ts.stage_name = 'New Stage'
   AND ts.stage_key ~ '[a-zA-Z0-9]';

-- ─── Step 3: SLUGIFY template stage_key ───────────────────────────
-- Deterministic per-template slug with numeric-suffix collision
-- handling. By the time this runs every stage_name is a real
-- label (bucket A, B via PROMOTE; bucket C via DERIVE; bucket D
-- was already correct), so base_slug is meaningful.

WITH slugged AS (
  SELECT
    ts.id,
    ts.template_id,
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(ts.stage_name), '[^a-z0-9]+', '_', 'g'),
        '^_+|_+$', '', 'g'
      ),
      '_{2,}', '_', 'g'
    ) AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY ts.template_id,
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(ts.stage_name), '[^a-z0-9]+', '_', 'g'),
            '^_+|_+$', '', 'g'
          ),
          '_{2,}', '_', 'g'
        )
      ORDER BY ts.stage_order, ts.id
    ) AS collision_index
  FROM workflow_template_stages ts
  JOIN workflow_templates t ON t.id = ts.template_id
  WHERE t.is_custom = true
)
UPDATE workflow_template_stages ts
   SET stage_key = CASE
     WHEN slugged.base_slug = '' THEN 'stage_' || slugged.collision_index
     WHEN slugged.collision_index = 1 THEN slugged.base_slug
     ELSE slugged.base_slug || '_' || slugged.collision_index
   END
  FROM slugged
 WHERE ts.id = slugged.id
   AND ts.stage_key <> CASE
     WHEN slugged.base_slug = '' THEN 'stage_' || slugged.collision_index
     WHEN slugged.collision_index = 1 THEN slugged.base_slug
     ELSE slugged.base_slug || '_' || slugged.collision_index
   END;

-- ─── Step 4: MIRROR key + name to workflow_stages ─────────────────
-- Live workflows carry their own copy of stage_key and stage_name
-- (the columns are the source of truth for the detail page). Push
-- the healed template values down so:
--   * URL paths in DELETE /api/workflows/[id]/stages/[stageKey]
--     stop receiving spaces + uppercase
--   * workflow_stages rows that still show 'New Stage' pick up
--     the derived-or-promoted name

UPDATE workflow_stages s
   SET stage_key = ts.stage_key
  FROM workflow_template_stages ts
 WHERE s.template_stage_id = ts.id
   AND s.stage_key <> ts.stage_key;

UPDATE workflow_stages s
   SET stage_name = ts.stage_name
  FROM workflow_template_stages ts
  JOIN workflow_templates t ON t.id = ts.template_id
 WHERE s.template_stage_id = ts.id
   AND t.is_custom = true
   AND s.stage_name = 'New Stage'
   AND ts.stage_name <> 'New Stage';
