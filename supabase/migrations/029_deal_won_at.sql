-- Backfill locked_at for existing won/lost deals that were set before migration 028
UPDATE public.sales_deals
  SET locked_at = created_at
  WHERE stage IN ('won', 'lost') AND locked_at IS NULL;
