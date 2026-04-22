-- Migration 034: Onboarding Pipeline System
-- Candidates, document templates, email templates, step-document assignments, email logs

-- ============================================================
-- 1. ONBOARDING PIPELINES (fixed: BDP + Market Leader)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.onboarding_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IN ('BDP', 'MARKET_LEADER')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.onboarding_pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  step_key TEXT NOT NULL CHECK (step_key IN ('interview', 'welcome_docs', 'completion')),
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_steps_pipeline ON public.onboarding_steps(pipeline_id, order_index);

-- ============================================================
-- 2. CANDIDATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role_type TEXT NOT NULL CHECK (role_type IN ('BDP', 'MARKET_LEADER')),
  application_date DATE,
  interview_date DATE,
  interview_time TEXT,
  status TEXT NOT NULL DEFAULT 'interview' CHECK (status IN (
    'interview',
    'pending_admin_review_1',
    'welcome_docs_sent',
    'pending_admin_review_2',
    'completed',
    'assigned_to_training',
    'terminated'
  )),
  current_pipeline_id UUID REFERENCES public.onboarding_pipelines(id),
  current_step_id UUID REFERENCES public.onboarding_steps(id),
  onboarding_completed_at TIMESTAMPTZ,
  assigned_training_pipeline_id UUID,
  terminated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidates_status ON public.candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_role ON public.candidates(role_type);
CREATE INDEX IF NOT EXISTS idx_candidates_pipeline ON public.candidates(current_pipeline_id);

-- ============================================================
-- 3. CANDIDATE DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.candidate_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_docs_candidate ON public.candidate_documents(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_docs_step ON public.candidate_documents(candidate_id, step_key);

-- ============================================================
-- 4. DOCUMENT TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pipeline_type TEXT NOT NULL CHECK (pipeline_type IN ('BDP', 'MARKET_LEADER', 'ALL')),
  step_key TEXT NOT NULL CHECK (step_key IN ('interview', 'welcome_docs')),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  version INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_templates_active ON public.document_templates(active, pipeline_type, step_key);

-- ============================================================
-- 5. EMAIL TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_templates_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_type TEXT NOT NULL,
  step_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. EMAIL LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES public.candidates(id),
  step_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  error_message TEXT,
  attachment_count INT DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_candidate ON public.email_logs(candidate_id);

-- ============================================================
-- 7. STEP DOCUMENT ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.step_document_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.onboarding_pipelines(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  document_template_id UUID NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
  required BOOLEAN NOT NULL DEFAULT true,
  order_index INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_step_doc_assign_pipeline ON public.step_document_assignments(pipeline_id, step_key);

-- ============================================================
-- 8. TERMINATION LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.termination_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id),
  terminated_by UUID REFERENCES auth.users(id),
  reason TEXT,
  terminated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_termination_logs_candidate ON public.termination_logs(candidate_id);

-- ============================================================
-- 9. SEED ONBOARDING PIPELINES
-- ============================================================
INSERT INTO public.onboarding_pipelines (id, name, role_type) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Business Development Partner', 'BDP'),
  ('b0000000-0000-0000-0000-000000000002', 'Market Leader', 'MARKET_LEADER')
ON CONFLICT DO NOTHING;

INSERT INTO public.onboarding_steps (pipeline_id, name, step_key, order_index) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Interview', 'interview', 0),
  ('b0000000-0000-0000-0000-000000000001', 'Welcome Docs', 'welcome_docs', 1),
  ('b0000000-0000-0000-0000-000000000001', 'Completion / Training Assignment', 'completion', 2),
  ('b0000000-0000-0000-0000-000000000002', 'Interview', 'interview', 0),
  ('b0000000-0000-0000-0000-000000000002', 'Welcome Docs', 'welcome_docs', 1),
  ('b0000000-0000-0000-0000-000000000002', 'Completion / Training Assignment', 'completion', 2)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 10. SEED DEFAULT EMAIL TEMPLATES
-- ============================================================
INSERT INTO public.email_templates_v2 (pipeline_type, step_key, subject, body_html) VALUES
  ('BDP', 'interview', 'Interview Documents — Business Development Partner',
   '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
     <h1 style="color:#111827;font-size:22px;margin:0 0 24px;">Interview Documents</h1>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Hello {{candidate_name}},</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Thank you for your interest in the Business Development Partner position. Please find attached the NDA, NCA, and Agreement documents for your review.</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Please sign and return these documents at your earliest convenience.</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;margin-top:24px;">Best regards,<br/>Vending Connector Team</p>
   </div>'),
  ('MARKET_LEADER', 'interview', 'Interview Documents — Market Leader',
   '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
     <h1 style="color:#111827;font-size:22px;margin:0 0 24px;">Interview Documents</h1>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Hello {{candidate_name}},</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Thank you for your interest in the Market Leader position. Please find attached the NDA, NCA, and Agreement documents for your review.</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Please sign and return these documents at your earliest convenience.</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;margin-top:24px;">Best regards,<br/>Vending Connector Team</p>
   </div>'),
  ('BDP', 'welcome_docs', 'Welcome — ACH & W9 Forms',
   '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
     <h1 style="color:#111827;font-size:22px;margin:0 0 24px;">Welcome Aboard!</h1>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Hello {{candidate_name}},</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Congratulations on moving forward! Please find attached your ACH and W9 forms.</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Please complete and return these at your earliest convenience.</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;margin-top:24px;">Best regards,<br/>Vending Connector Team</p>
   </div>'),
  ('MARKET_LEADER', 'welcome_docs', 'Welcome — ACH & W9 Forms',
   '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
     <h1 style="color:#111827;font-size:22px;margin:0 0 24px;">Welcome Aboard!</h1>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Hello {{candidate_name}},</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Congratulations on moving forward to the Market Leader role! Please find attached your ACH and W9 forms.</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;">Please complete and return these at your earliest convenience.</p>
     <p style="color:#374151;font-size:14px;line-height:1.6;margin-top:24px;">Best regards,<br/>Vending Connector Team</p>
   </div>')
ON CONFLICT DO NOTHING;

-- NOTE: Create a Supabase Storage bucket named "document-templates" via the dashboard.
-- This bucket stores the PDF templates that get attached to onboarding emails.
