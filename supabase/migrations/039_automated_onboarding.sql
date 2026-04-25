-- Migration 039: Automated Onboarding — E-Signatures, Payments, Step Gating
-- Adds: pipeline step configuration for signatures/payments/approval,
--        esign_documents tracking, pipeline_payments tracking

-- ============================================================
-- 1. EXTEND PIPELINE_STEPS WITH GATING CONFIG
-- ============================================================
ALTER TABLE public.pipeline_steps
  ADD COLUMN IF NOT EXISTS requires_signature BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_payment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_admin_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_description TEXT;

-- ============================================================
-- 2. E-SIGNATURE DOCUMENTS (tracks sent + signed docs per pipeline item)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.esign_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_item_id UUID NOT NULL REFERENCES public.pipeline_items(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.pipeline_steps(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'pandadoc' CHECK (provider IN ('pandadoc', 'dropbox_sign')),
  external_document_id TEXT,
  template_id TEXT,
  document_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'sent', 'viewed', 'waiting_approval', 'completed', 'declined', 'voided', 'expired'
  )),
  signed_pdf_url TEXT,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esign_docs_item ON public.esign_documents(pipeline_item_id);
CREATE INDEX IF NOT EXISTS idx_esign_docs_step ON public.esign_documents(step_id);
CREATE INDEX IF NOT EXISTS idx_esign_docs_external ON public.esign_documents(external_document_id);
CREATE INDEX IF NOT EXISTS idx_esign_docs_status ON public.esign_documents(status);

-- ============================================================
-- 3. PIPELINE PAYMENTS (tracks payments per pipeline item per step)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pipeline_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_item_id UUID NOT NULL REFERENCES public.pipeline_items(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.pipeline_steps(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'paypal' CHECK (provider IN ('paypal', 'stripe')),
  external_order_id TEXT,
  external_payment_id TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'created', 'approved', 'completed', 'failed', 'refunded', 'cancelled'
  )),
  payment_url TEXT,
  paid_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_item ON public.pipeline_payments(pipeline_item_id);
CREATE INDEX IF NOT EXISTS idx_payments_step ON public.pipeline_payments(step_id);
CREATE INDEX IF NOT EXISTS idx_payments_external ON public.pipeline_payments(external_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.pipeline_payments(status);

-- ============================================================
-- 4. ADMIN APPROVALS (tracks manual approvals per pipeline item per step)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.step_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_item_id UUID NOT NULL REFERENCES public.pipeline_items(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.pipeline_steps(id) ON DELETE CASCADE,
  approved_by UUID REFERENCES auth.users(id),
  approved BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_item ON public.step_approvals(pipeline_item_id, step_id);

-- ============================================================
-- 5. EXTEND PIPELINE_ITEMS WITH CANDIDATE + AUTOMATION TRACKING
-- ============================================================
ALTER TABLE public.pipeline_items
  ADD COLUMN IF NOT EXISTS candidate_id UUID REFERENCES public.candidates(id),
  ADD COLUMN IF NOT EXISTS auto_advance BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pipeline_items_candidate ON public.pipeline_items(candidate_id);

-- ============================================================
-- 6. ADD CANDIDATE_ID TO ESIGN_DOCUMENTS AND PIPELINE_PAYMENTS
-- ============================================================
ALTER TABLE public.esign_documents
  ADD COLUMN IF NOT EXISTS candidate_id UUID REFERENCES public.candidates(id);

ALTER TABLE public.pipeline_payments
  ADD COLUMN IF NOT EXISTS candidate_id UUID REFERENCES public.candidates(id);

CREATE INDEX IF NOT EXISTS idx_esign_docs_candidate ON public.esign_documents(candidate_id);
CREATE INDEX IF NOT EXISTS idx_payments_candidate ON public.pipeline_payments(candidate_id);
