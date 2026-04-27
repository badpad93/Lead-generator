-- Migration 047: Retarget Location Sale automation to the LIVE pipeline UUID
--
-- Context: Migrations 045/046 used a fictional UUID 'a0000000-...-0004' which
-- does not exist in production. The live "Location Sale to Operator" pipeline
-- has UUID '21f63d2a-d46a-4195-ad3b-71052c78f7fd'. This migration:
--   1. Ensures requires_order column exists (idempotent from 045)
--   2. Cleans up the fictional pipeline if it was partially created
--   3. Renames the live pipeline
--   4. Replaces steps on the live pipeline with properly gated steps
--   5. Clears test pipeline items
--
-- Safe to re-run. Safe after 045 partial-success + 046 FK-failure.

-- ============================================================
-- 1. ENSURE requires_order COLUMN EXISTS (idempotent)
-- ============================================================
ALTER TABLE public.pipeline_steps
  ADD COLUMN IF NOT EXISTS requires_order BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 2. CLEAN UP FICTIONAL PIPELINE (from 045/046 if it was created)
-- ============================================================
DELETE FROM public.pipeline_items
  WHERE pipeline_id = 'a0000000-0000-0000-0000-000000000004';
DELETE FROM public.pipeline_steps
  WHERE pipeline_id = 'a0000000-0000-0000-0000-000000000004';
DELETE FROM public.pipelines
  WHERE id = 'a0000000-0000-0000-0000-000000000004';

-- ============================================================
-- 3. RENAME LIVE PIPELINE (row already exists in production)
-- ============================================================
UPDATE public.pipelines
SET name = 'Location Sale to Operator', updated_at = now()
WHERE id = '21f63d2a-d46a-4195-ad3b-71052c78f7fd';

-- ============================================================
-- 4. CLEAR TEST PIPELINE ITEMS (user confirmed: wipe test deals)
-- ============================================================
DELETE FROM public.pipeline_items
  WHERE pipeline_id = '21f63d2a-d46a-4195-ad3b-71052c78f7fd';

-- ============================================================
-- 5. REPLACE STEPS (delete + fresh insert)
-- ============================================================
DELETE FROM public.pipeline_steps
  WHERE pipeline_id = '21f63d2a-d46a-4195-ad3b-71052c78f7fd';

INSERT INTO public.pipeline_steps
  (id, pipeline_id, name, order_index,
   requires_document, requires_signature, requires_payment, requires_admin_approval, requires_order,
   pandadoc_preliminary_template_id, pandadoc_full_template_id, payment_provider)
VALUES
  -- Step 1: New Lead — no requirements
  ('b0000004-0000-0000-0000-000000000001', '21f63d2a-d46a-4195-ad3b-71052c78f7fd',
   'New Lead', 0,
   false, false, false, false, false,
   NULL, NULL, 'none'),

  -- Step 2: Order Created — requires operator account + location attached
  ('b0000004-0000-0000-0000-000000000002', '21f63d2a-d46a-4195-ad3b-71052c78f7fd',
   'Order Created', 1,
   false, false, false, false, true,
   NULL, NULL, 'none'),

  -- Step 3: Agreement Sent — e-sign + payment via PandaDoc+Stripe
  -- TODO: Set pandadoc_full_template_id once the full template is built in PandaDoc
  ('b0000004-0000-0000-0000-000000000003', '21f63d2a-d46a-4195-ad3b-71052c78f7fd',
   'Agreement Sent', 2,
   false, true, true, false, false,
   'NdRxHhZs54MzmiGPoCcEUe', NULL, 'pandadoc_stripe'),

  -- Step 4: Signed & Paid — auto-advanced by esign webhook
  ('b0000004-0000-0000-0000-000000000004', '21f63d2a-d46a-4195-ad3b-71052c78f7fd',
   'Signed & Paid', 3,
   false, false, false, false, false,
   NULL, NULL, 'none'),

  -- Step 5: Full Proposal Delivered — auto-set when full proposal generated
  ('b0000004-0000-0000-0000-000000000005', '21f63d2a-d46a-4195-ad3b-71052c78f7fd',
   'Full Proposal Delivered', 4,
   false, false, false, false, false,
   NULL, NULL, 'none'),

  -- Step 6: Won — terminal step
  ('b0000004-0000-0000-0000-000000000006', '21f63d2a-d46a-4195-ad3b-71052c78f7fd',
   'Won', 5,
   false, false, false, false, false,
   NULL, NULL, 'none');
