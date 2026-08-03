-- Migration 130 — Custom workflow templates for admin-managed
-- perpetual tasks (account management, cold calling, operator
-- coaching, etc.) with configurable workload point value.

ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS workload_weight int NOT NULL DEFAULT 1
    CHECK (workload_weight BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category text;

-- Seeded (built-in) templates that shipped with migration 125 are
-- flagged as non-custom so the admin UI can protect them from edits.
-- Category left NULL; the admin can categorize later if desired.
UPDATE public.workflow_templates
   SET is_custom = false
 WHERE workflow_type IN (
   'ai_machine_fulfillment', 'location_services', 'financing',
   'coffee_equipment', 'coffee_service', 'website_build'
 );

CREATE INDEX IF NOT EXISTS idx_workflow_templates_custom
  ON public.workflow_templates(is_custom, category)
  WHERE active = true;

COMMENT ON COLUMN public.workflow_templates.workload_weight IS
  'Point value each spawned workflow instance contributes to an
   assignee''s total workload. Built-in templates stay at 1; admins
   can weight custom perpetual tasks higher (e.g. key account
   management = 5, cold calling = 1). Capped 1-20.';
COMMENT ON COLUMN public.workflow_templates.is_custom IS
  'true = admin-created template, editable/deletable via the admin
   templates UI. false = seeded from code (protected from CRUD).';
COMMENT ON COLUMN public.workflow_templates.category IS
  'Freeform group label for the admin templates page. Suggested
   categories: Perpetual, Account Management, Sales Ops,
   Operator Coaching, Other.';
