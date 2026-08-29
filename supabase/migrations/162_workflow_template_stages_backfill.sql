-- Backfill the workflow_template_stages rows the admin editor wrote
-- with the wrong shape.
--
-- Root cause: the editor had two adjacent text inputs (stage_name
-- and stage_key). Admins kept typing the human label into the
-- stage_key box while leaving stage_name at its "New Stage"
-- placeholder — the DB then had rows like:
--   stage_key = 'contacted prospects', stage_name = 'New Stage'
-- Plus keys with spaces and mixed case, which break the URL path
-- in DELETE /api/workflows/[id]/stages/[stageKey].
--
-- Post-fix, the API always slugifies stage_key from stage_name. This
-- migration heals the rows that were saved before that fix landed.
--
-- Strategy:
--   1. For any custom template stage where stage_name = 'New Stage'
--      AND the stage_key still looks like a human label (contains a
--      space or uppercase letter), promote the stage_key value into
--      stage_name.
--   2. For every custom template stage, rewrite stage_key to a
--      slug of stage_name — lowercase, [a-z0-9] with underscore
--      separators, no leading/trailing/duplicate underscores. Add a
--      numeric suffix on collision inside a template.
--   3. Same treatment for workflow_stages rows spawned from those
--      broken templates, so live workflows also render correctly.
--
-- Idempotent: re-running is a no-op because slugifying an already-
-- slugified key produces the same value, and the promotion step
-- only fires when stage_name is still 'New Stage'.

-- Step 1 — promote the mis-typed name from stage_key into stage_name.
UPDATE workflow_template_stages ts
   SET stage_name = ts.stage_key
  FROM workflow_templates t
 WHERE ts.template_id = t.id
   AND t.is_custom = true
   AND ts.stage_name = 'New Stage'
   AND (ts.stage_key ~ '[[:upper:] ]');

UPDATE workflow_stages s
   SET stage_name = s.stage_key
  FROM workflow_template_stages ts
 WHERE s.template_stage_id = ts.id
   AND s.stage_name = 'New Stage'
   AND (s.stage_key ~ '[[:upper:] ]');

-- Step 2 — slugify keys per template. Uses a CTE that computes a
-- deterministic slug base + row_number for de-duplication within a
-- template.
WITH slugged AS (
  SELECT
    ts.id,
    ts.template_id,
    -- Base slug from stage_name.
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
-- workflows also lose the spaces/uppercase in their URL paths.
UPDATE workflow_stages s
   SET stage_key = ts.stage_key
  FROM workflow_template_stages ts
 WHERE s.template_stage_id = ts.id
   AND s.stage_key <> ts.stage_key;
