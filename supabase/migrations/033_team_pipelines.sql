-- Migration 033: Team + Pipelines System
-- Adds employees, pipelines, pipeline steps, step gating, and document requirements

-- ============================================================
-- 1. EMPLOYEES / TEAM
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'sales_rep' CHECK (role IN ('sales_rep', 'market_leader', 'admin', 'director_of_sales', 'operations', 'support')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_email ON public.employees(email);

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_docs_employee ON public.employee_documents(employee_id);

-- ============================================================
-- 2. PIPELINES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'sales' CHECK (type IN ('hiring', 'sales')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pipeline_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  requires_document BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_steps_pipeline ON public.pipeline_steps(pipeline_id, order_index);

-- ============================================================
-- 3. PIPELINE ITEMS (replaces deals for pipeline tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pipeline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.sales_accounts(id),
  employee_id UUID REFERENCES public.employees(id),
  lead_id UUID REFERENCES public.sales_leads(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost')),
  current_step_id UUID REFERENCES public.pipeline_steps(id),
  value NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_items_pipeline ON public.pipeline_items(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_step ON public.pipeline_items(current_step_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_account ON public.pipeline_items(account_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_status ON public.pipeline_items(status);

-- ============================================================
-- 4. STEP DOCUMENT REQUIREMENTS (what docs a step needs)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.step_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES public.pipeline_steps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_step_docs_step ON public.step_documents(step_id);

-- ============================================================
-- 5. PIPELINE ITEM DOCUMENTS (uploaded docs per item per step)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pipeline_item_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_item_id UUID NOT NULL REFERENCES public.pipeline_items(id) ON DELETE CASCADE,
  step_document_id UUID NOT NULL REFERENCES public.step_documents(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_docs_item ON public.pipeline_item_documents(pipeline_item_id);
CREATE INDEX IF NOT EXISTS idx_item_docs_step_doc ON public.pipeline_item_documents(step_document_id);

-- ============================================================
-- 6. SEED DEFAULT PIPELINES
-- ============================================================

-- Interviewing pipeline
INSERT INTO public.pipelines (id, name, type) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Interviewing', 'hiring')
ON CONFLICT DO NOTHING;

INSERT INTO public.pipeline_steps (pipeline_id, name, order_index, requires_document) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Application Received', 0, true),
  ('a0000000-0000-0000-0000-000000000001', 'Phone Screen', 1, false),
  ('a0000000-0000-0000-0000-000000000001', 'Interview', 2, false),
  ('a0000000-0000-0000-0000-000000000001', 'Offer Extended', 3, true),
  ('a0000000-0000-0000-0000-000000000001', 'Hired', 4, true)
ON CONFLICT DO NOTHING;

-- Onboarding pipeline
INSERT INTO public.pipelines (id, name, type) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'Onboarding', 'hiring')
ON CONFLICT DO NOTHING;

INSERT INTO public.pipeline_steps (pipeline_id, name, order_index, requires_document) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'W9 Submitted', 0, true),
  ('a0000000-0000-0000-0000-000000000002', 'ID Verified', 1, true),
  ('a0000000-0000-0000-0000-000000000002', 'Training Started', 2, false),
  ('a0000000-0000-0000-0000-000000000002', 'Training Complete', 3, true),
  ('a0000000-0000-0000-0000-000000000002', 'Active', 4, false)
ON CONFLICT DO NOTHING;

-- Machine Sales pipeline
INSERT INTO public.pipelines (id, name, type) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'Machine Sales', 'sales')
ON CONFLICT DO NOTHING;

INSERT INTO public.pipeline_steps (pipeline_id, name, order_index, requires_document) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'New Lead', 0, false),
  ('a0000000-0000-0000-0000-000000000003', 'Contacted', 1, false),
  ('a0000000-0000-0000-0000-000000000003', 'Qualified', 2, false),
  ('a0000000-0000-0000-0000-000000000003', 'Proposal Sent', 3, true),
  ('a0000000-0000-0000-0000-000000000003', 'Contract Signed', 4, true),
  ('a0000000-0000-0000-0000-000000000003', 'Closed Won', 5, false)
ON CONFLICT DO NOTHING;

-- Location Sales pipeline
INSERT INTO public.pipelines (id, name, type) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'Location Sales', 'sales')
ON CONFLICT DO NOTHING;

INSERT INTO public.pipeline_steps (pipeline_id, name, order_index, requires_document) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'New Lead', 0, false),
  ('a0000000-0000-0000-0000-000000000004', 'Contacted', 1, false),
  ('a0000000-0000-0000-0000-000000000004', 'Site Assessment', 2, true),
  ('a0000000-0000-0000-0000-000000000004', 'Agreement Sent', 3, true),
  ('a0000000-0000-0000-0000-000000000004', 'Placed', 4, false)
ON CONFLICT DO NOTHING;

-- Coffee Sales pipeline
INSERT INTO public.pipelines (id, name, type) VALUES
  ('a0000000-0000-0000-0000-000000000005', 'Coffee Sales', 'sales')
ON CONFLICT DO NOTHING;

INSERT INTO public.pipeline_steps (pipeline_id, name, order_index, requires_document) VALUES
  ('a0000000-0000-0000-0000-000000000005', 'New Lead', 0, false),
  ('a0000000-0000-0000-0000-000000000005', 'Contacted', 1, false),
  ('a0000000-0000-0000-0000-000000000005', 'Tasting Scheduled', 2, false),
  ('a0000000-0000-0000-0000-000000000005', 'Proposal', 3, true),
  ('a0000000-0000-0000-0000-000000000005', 'Closed Won', 4, false)
ON CONFLICT DO NOTHING;

-- Financing Sales pipeline
INSERT INTO public.pipelines (id, name, type) VALUES
  ('a0000000-0000-0000-0000-000000000006', 'Financing Sales', 'sales')
ON CONFLICT DO NOTHING;

INSERT INTO public.pipeline_steps (pipeline_id, name, order_index, requires_document) VALUES
  ('a0000000-0000-0000-0000-000000000006', 'Application', 0, true),
  ('a0000000-0000-0000-0000-000000000006', 'Credit Review', 1, true),
  ('a0000000-0000-0000-0000-000000000006', 'Approved', 2, false),
  ('a0000000-0000-0000-0000-000000000006', 'Funded', 3, true)
ON CONFLICT DO NOTHING;

-- Ad Sales pipeline
INSERT INTO public.pipelines (id, name, type) VALUES
  ('a0000000-0000-0000-0000-000000000007', 'Ad Sales', 'sales')
ON CONFLICT DO NOTHING;

INSERT INTO public.pipeline_steps (pipeline_id, name, order_index, requires_document) VALUES
  ('a0000000-0000-0000-0000-000000000007', 'New Lead', 0, false),
  ('a0000000-0000-0000-0000-000000000007', 'Contacted', 1, false),
  ('a0000000-0000-0000-0000-000000000007', 'Media Kit Sent', 2, true),
  ('a0000000-0000-0000-0000-000000000007', 'IO Signed', 3, true),
  ('a0000000-0000-0000-0000-000000000007', 'Live', 4, false)
ON CONFLICT DO NOTHING;
