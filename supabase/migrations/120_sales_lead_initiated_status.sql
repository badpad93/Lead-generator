-- Add 'initiated' to sales_leads.status
--
-- New status option that sits between 'new' (fresh lead, no outreach) and
-- 'contacted' (reached out and got a response). 'initiated' means the
-- rep has begun outreach — first email sent, voicemail left, LinkedIn
-- ping — but hasn't yet had a two-way conversation. Distinguishes
-- "haven't done anything yet" from "have done something, waiting on
-- them" so the pipeline funnel is more accurate.
--
-- Existing rows are unaffected — no UPDATE, no data change. Only the
-- CHECK constraint's allowed value set is widened. Non-destructive.

ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_status_check;
ALTER TABLE public.sales_leads
  ADD CONSTRAINT sales_leads_status_check
  CHECK (status IN (
    'new',
    'initiated',
    'contacted',
    'qualified',
    'unqualified',
    'lost'
  ));
