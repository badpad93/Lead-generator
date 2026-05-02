ALTER TABLE public.machine_listings
  ADD COLUMN IF NOT EXISTS delivery_fee_cents integer;
