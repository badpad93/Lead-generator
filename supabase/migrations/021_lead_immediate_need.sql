-- Add "Immediate need" classification to leads.
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS immediate_need text
    CHECK (immediate_need IN (
      'location',
      'machine',
      'digital',
      'llc_compliance',
      'coffee',
      'financing',
      'total_operator_package'
    ));

NOTIFY pgrst, 'reload schema';
