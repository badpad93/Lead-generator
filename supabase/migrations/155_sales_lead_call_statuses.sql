-- Migration 155: add 'call_1' and 'call_2' to sales_leads.status
--
-- Two new status values sitting between 'initiated' (rep has begun
-- outreach) and 'contacted' (two-way conversation). Reps who work
-- a set number of dials before promoting a lead need visibility of
-- how many attempts have gone out — Call 1 and Call 2 make that
-- explicit without inventing a separate call-log entity.
--
-- The status funnel now reads:
--   new -> initiated -> call_1 -> call_2 -> contacted -> qualified
--   ...also: won, unqualified, lost (unchanged)
--
-- Existing rows are unaffected — no UPDATE, no data change. Only
-- the CHECK constraint's allowed value set is widened.

ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_status_check;
ALTER TABLE public.sales_leads
  ADD CONSTRAINT sales_leads_status_check
  CHECK (status IN (
    'new',
    'initiated',
    'call_1',
    'call_2',
    'contacted',
    'qualified',
    'unqualified',
    'lost'
  ));

NOTIFY pgrst, 'reload schema';
