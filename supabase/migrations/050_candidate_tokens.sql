-- Migration 050: Candidate submission portal
-- Mirrors agreement_tokens pattern for onboarding: token-based document submission portal
-- that auto-advances candidates when all required docs are uploaded.

-- ============================================================
-- 1. CANDIDATE TOKENS — unique links for candidates to submit docs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.candidate_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  pipeline_id UUID NOT NULL,

  -- Status: pending → viewed → submitted
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'submitted', 'expired')),

  -- Track which required docs have been uploaded
  required_doc_count INT NOT NULL DEFAULT 0,
  submitted_doc_count INT NOT NULL DEFAULT 0,

  viewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_tokens_token ON public.candidate_tokens(token);
CREATE INDEX IF NOT EXISTS idx_candidate_tokens_candidate ON public.candidate_tokens(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_tokens_status ON public.candidate_tokens(status);

-- ============================================================
-- 2. ADD document_template_id + completed TO candidate_documents
-- Links each uploaded doc back to the template it fulfills
-- ============================================================
ALTER TABLE public.candidate_documents
  ADD COLUMN IF NOT EXISTS document_template_id UUID REFERENCES public.document_templates(id),
  ADD COLUMN IF NOT EXISTS candidate_token_id UUID REFERENCES public.candidate_tokens(id),
  ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_candidate_docs_template ON public.candidate_documents(candidate_id, document_template_id);

-- ============================================================
-- 3. RLS policies for service_role access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_candidate_tokens') THEN
    ALTER TABLE public.candidate_tokens ENABLE ROW LEVEL SECURITY;
    CREATE POLICY service_role_candidate_tokens ON public.candidate_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
