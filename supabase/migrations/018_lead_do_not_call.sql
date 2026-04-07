-- Add Do Not Call flag to CRM leads
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS do_not_call boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
