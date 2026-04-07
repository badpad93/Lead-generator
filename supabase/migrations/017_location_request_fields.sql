-- Add fields used by the public "Request Location Services" form.
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS machine_count integer,
  ADD COLUMN IF NOT EXISTS source text;

NOTIFY pgrst, 'reload schema';
