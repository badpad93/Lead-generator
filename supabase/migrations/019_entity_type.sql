-- Designate leads & accounts as operator / location / machine sales company.
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS entity_type text
    CHECK (entity_type IN ('operator', 'location', 'machine_sales'));

ALTER TABLE public.sales_accounts
  ADD COLUMN IF NOT EXISTS entity_type text
    CHECK (entity_type IN ('operator', 'location', 'machine_sales'));

NOTIFY pgrst, 'reload schema';
