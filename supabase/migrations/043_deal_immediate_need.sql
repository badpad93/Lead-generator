-- Migration 043: Add immediate_need column to sales_deals
-- Carries over the lead's immediate_need when converting lead → deal.
ALTER TABLE public.sales_deals
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
