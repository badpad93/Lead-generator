-- Make lead deletion safe: detach deals automatically instead of blocking
ALTER TABLE public.sales_deals DROP CONSTRAINT IF EXISTS sales_deals_lead_id_fkey;
ALTER TABLE public.sales_deals
  ADD CONSTRAINT sales_deals_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.sales_leads(id) ON DELETE SET NULL;
