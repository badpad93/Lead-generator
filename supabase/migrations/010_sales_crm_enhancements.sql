-- ==========================================================
-- Sales CRM enhancements: standard CRM fields + fix profile join
-- Run in Supabase SQL Editor
-- ==========================================================

-- Add standard CRM columns to sales_leads
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Allow 'lost' status (standard CRM lead state)
ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_status_check;
ALTER TABLE public.sales_leads
  ADD CONSTRAINT sales_leads_status_check
  CHECK (status IN ('new', 'contacted', 'qualified', 'unqualified', 'lost'));

CREATE INDEX IF NOT EXISTS idx_sales_leads_created_by ON public.sales_leads(created_by);
CREATE INDEX IF NOT EXISTS idx_sales_leads_followup ON public.sales_leads(next_followup_at);

-- Lead activity log (calls, emails, notes, meetings)
CREATE TABLE IF NOT EXISTS public.sales_lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  type text NOT NULL CHECK (type IN ('note', 'call', 'email', 'meeting', 'status_change')),
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON public.sales_lead_activities(lead_id);

ALTER TABLE public.sales_lead_activities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_lead_activities') THEN
    CREATE POLICY service_role_lead_activities ON public.sales_lead_activities FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
