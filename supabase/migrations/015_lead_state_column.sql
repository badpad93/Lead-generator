-- Add structured state field to sales_leads for filtering
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS city text;

CREATE INDEX IF NOT EXISTS idx_sales_leads_state ON public.sales_leads(state);
