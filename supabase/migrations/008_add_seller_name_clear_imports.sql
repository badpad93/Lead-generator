-- ============================================================
-- Add seller_name column and clear imported lead descriptions
-- ============================================================

-- Add seller_name column
ALTER TABLE public.vending_requests
  ADD COLUMN IF NOT EXISTS seller_name text;

-- Clear description on imported leads that contain "Original seller" text
UPDATE public.vending_requests
  SET description = NULL
  WHERE description LIKE '%Original seller%'
     OR description LIKE '%Imported lead%';
