-- Migration 046: Fix Location Sale pipeline bootstrap
-- Migration 045 assumed the pipelines row already existed. On production the
-- UPDATE was a silent no-op and the subsequent INSERT INTO pipeline_steps
-- failed with FK violation 23503. This migration is safe to run whether 045
-- partially succeeded (ALTER TABLE only) or fully failed.

-- ============================================================
-- 1. Ensure requires_order column exists (idempotent, may already
--    exist from 045's successful ALTER TABLE)
-- ============================================================
ALTER TABLE public.pipeline_steps
  ADD COLUMN IF NOT EXISTS requires_order BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 2. Upsert pipeline row (create if missing, rename if exists)
-- ============================================================
INSERT INTO public.pipelines (id, name, type, created_at, updated_at)
VALUES ('a0000000-0000-0000-0000-000000000004', 'Location Sale to Operator', 'sales', now(), now())
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, updated_at = now();

-- ============================================================
-- 3. Replace steps (wipe + re-insert for a clean slate)
-- ============================================================
DELETE FROM public.pipeline_steps
WHERE pipeline_id = 'a0000000-0000-0000-0000-000000000004';

INSERT INTO public.pipeline_steps
  (id, pipeline_id, name, order_index,
   requires_document, requires_signature, requires_payment, requires_admin_approval, requires_order,
   pandadoc_preliminary_template_id, pandadoc_full_template_id, payment_provider)
VALUES
  ('b0000004-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004',
   'New Lead', 0,
   false, false, false, false, false,
   NULL, NULL, 'none'),

  ('b0000004-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004',
   'Order Created', 1,
   false, false, false, false, true,
   NULL, NULL, 'none'),

  -- TODO: Set pandadoc_full_template_id once the full template is built
  ('b0000004-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004',
   'Agreement Sent', 2,
   false, true, true, false, false,
   'NdRxHhZs54MzmiGPoCcEUe', NULL, 'pandadoc_stripe'),

  ('b0000004-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004',
   'Signed & Paid', 3,
   false, false, false, false, false,
   NULL, NULL, 'none'),

  ('b0000004-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000004',
   'Full Proposal Delivered', 4,
   false, false, false, false, false,
   NULL, NULL, 'none'),

  ('b0000004-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004',
   'Won', 5,
   false, false, false, false, false,
   NULL, NULL, 'none');

-- ============================================================
-- 4. Reset dangling step references on existing pipeline items
-- ============================================================
UPDATE public.pipeline_items
SET current_step_id = 'b0000004-0000-0000-0000-000000000001',
    updated_at = now()
WHERE pipeline_id = 'a0000000-0000-0000-0000-000000000004'
  AND current_step_id IS NOT NULL
  AND current_step_id NOT IN (
    SELECT id FROM public.pipeline_steps
    WHERE pipeline_id = 'a0000000-0000-0000-0000-000000000004'
  );
