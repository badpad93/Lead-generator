-- Add pending_approval status to user_listings for admin review before going live

ALTER TABLE public.user_listings
  DROP CONSTRAINT IF EXISTS user_listings_status_check;

ALTER TABLE public.user_listings
  ADD CONSTRAINT user_listings_status_check
  CHECK (status IN ('active', 'sold', 'expired', 'removed', 'pending_verification', 'pending_approval'));
