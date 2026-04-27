-- Migration 045: Configure "Location Sale to Operator" pipeline
-- Adds requires_order gating column, re-seeds pipeline steps with proper
-- gating, template IDs, and payment config.

-- ============================================================
-- 1. ADD requires_order COLUMN TO pipeline_steps
-- ============================================================
ALTER TABLE public.pipeline_steps
  ADD COLUMN IF NOT EXISTS requires_order BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 2. RENAME PIPELINE
-- ============================================================
UPDATE public.pipelines
SET name = 'Location Sale to Operator', updated_at = now()
WHERE id = 'a0000000-0000-0000-0000-000000000004';

-- ============================================================
-- 3. REPLACE STEPS (old seed had placeholder steps without gating)
-- ============================================================
DELETE FROM public.pipeline_steps
WHERE pipeline_id = 'a0000000-0000-0000-0000-000000000004';

INSERT INTO public.pipeline_steps
  (id, pipeline_id, name, order_index,
   requires_document, requires_signature, requires_payment, requires_admin_approval, requires_order,
   pandadoc_preliminary_template_id, pandadoc_full_template_id, payment_provider)
VALUES
  -- Step 1: New Lead — no requirements
  ('b0000004-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004',
   'New Lead', 0,
   false, false, false, false, false,
   NULL, NULL, 'none'),

  -- Step 2: Order Created — requires operator account + location attached
  ('b0000004-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004',
   'Order Created', 1,
   false, false, false, false, true,
   NULL, NULL, 'none'),

  -- Step 3: Agreement Sent — e-sign + payment via PandaDoc+Stripe
  -- TODO: Set pandadoc_full_template_id once the full template is built in PandaDoc
  ('b0000004-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004',
   'Agreement Sent', 2,
   false, true, true, false, false,
   'NdRxHhZs54MzmiGPoCcEUe', NULL, 'pandadoc_stripe'),

  -- Step 4: Signed & Paid — auto-advanced by esign webhook
  ('b0000004-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004',
   'Signed & Paid', 3,
   false, false, false, false, false,
   NULL, NULL, 'none'),

  -- Step 5: Full Proposal Delivered — auto-set when full proposal generated
  ('b0000004-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000004',
   'Full Proposal Delivered', 4,
   false, false, false, false, false,
   NULL, NULL, 'none'),

  -- Step 6: Won — terminal step
  ('b0000004-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004',
   'Won', 5,
   false, false, false, false, false,
   NULL, NULL, 'none');

-- ============================================================
-- 4. FIX EXISTING PIPELINE ITEMS (reset dangling step references)
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
