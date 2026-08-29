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
-- Strategy (statements execute in the migration transaction in
-- declaration order; each UPDATE completes before the next starts):
--
--   Step 1: PROMOTE — for every custom-template stage where the
--     stage_key looks like a human label (contains a space or an
--     uppercase letter), copy the key value into stage_name. We do
--     NOT gate on the current stage_name because the incumbent
--     value is either 'New Stage' or a garbage concatenation, and
--     neither is worth preserving. Runs BEFORE any slug rewrite so
--     the label is captured verbatim.
--
--   Step 2: SLUGIFY — deterministic slug per (template_id) with a
--     numeric suffix on collision. Only writes when the current key
--     differs from the target slug, so idempotent.
--
--   Step 3: MIRROR — copy the new slugified keys onto every
--     workflow_stages row that references those template stages, so
--     the URL path in DELETE /api/workflows/[id]/stages/[stageKey]
--     stops receiving spaces + uppercase for live workflows.
--
--   Step 4: DERIVE — any row that's still stage_name = 'New Stage'
--     after Step 1 had a key that was already clean-looking
--     ('onboarding', 'test', ...). The typed original is lost, so
--     titlecase the key as the best available fallback:
--     'onboarding' -> 'Onboarding'. Beats leaving 'New Stage'.
--
-- Idempotent: re-running is a no-op. Step 1 won't fire on a slugified
-- key (no space/uppercase). Step 2 short-circuits when the key
-- already matches. Step 4 won't fire on rows no longer named
-- 'New Stage'.
--
-- Expected end state after this migration runs:
--   - zero custom-template stages with stage_name = 'New Stage'
--   - zero custom-template stage_key values matching [[:space:][:upper:]]
--   - 'Finish setting up lead' preserved on the template it came from
--     (as stage_name; its key becomes finish_setting_up_lead)

-- Step 1 — promote key -> name whenever the key looks like a human
-- label, regardless of what stage_name currently holds. This runs
-- BEFORE Step 2's slug rewrite so the label is captured intact.
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

-- Step 2 — slugify every custom-template stage_key. Deterministic
-- collision handling: first occurrence per template keeps the bare
-- slug, subsequent occurrences get "_2", "_3", ...
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

-- Step 3 — mirror the slugified keys onto workflow_stages so live
-- workflows lose the spaces/uppercase in their URL paths.
UPDATE workflow_stages s
   SET stage_key = ts.stage_key
  FROM workflow_template_stages ts
 WHERE s.template_stage_id = ts.id
   AND s.stage_key <> ts.stage_key;

-- Step 4 — for rows still named 'New Stage', derive a readable name
-- from the (now-clean) slugified key. The original typed name is
-- unrecoverable for these rows; titlecase of the key beats the
-- placeholder. Also handle the workflow_stages copies.
UPDATE workflow_template_stages ts
   SET stage_name = initcap(replace(ts.stage_key, '_', ' '))
  FROM workflow_templates t
 WHERE ts.template_id = t.id
   AND t.is_custom = true
   AND ts.stage_name = 'New Stage';

UPDATE workflow_stages s
   SET stage_name = initcap(replace(s.stage_key, '_', ' '))
  FROM workflow_template_stages ts
  JOIN workflow_templates t ON t.id = ts.template_id
 WHERE s.template_stage_id = ts.id
   AND t.is_custom = true
   AND s.stage_name = 'New Stage';
