-- Add vending_maintenance to entity_type options.
ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_entity_type_check;
ALTER TABLE public.sales_leads
  ADD CONSTRAINT sales_leads_entity_type_check
  CHECK (entity_type IN ('operator', 'location', 'machine_sales', 'vending_maintenance'));

ALTER TABLE public.sales_accounts DROP CONSTRAINT IF EXISTS sales_accounts_entity_type_check;
ALTER TABLE public.sales_accounts
  ADD CONSTRAINT sales_accounts_entity_type_check
  CHECK (entity_type IN ('operator', 'location', 'machine_sales', 'vending_maintenance'));

NOTIFY pgrst, 'reload schema';
