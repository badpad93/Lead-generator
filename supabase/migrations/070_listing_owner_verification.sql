-- Migration 070: Location owner verification for marketplace listings
--
-- When a user posts a lead for sale, an agreement is sent to the location owner.
-- The listing stays in "pending_verification" until the owner signs.
-- On signature the listing auto-publishes.

-- 1. Add listing_id to location_agreements so we can link to user_listings
ALTER TABLE public.location_agreements
  ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES public.user_listings(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_location_agreements_listing
  ON public.location_agreements(listing_id);

-- 2. Add pending_verification + expired to the user_listings status check
ALTER TABLE public.user_listings
  DROP CONSTRAINT IF EXISTS user_listings_status_check;

ALTER TABLE public.user_listings
  ADD CONSTRAINT user_listings_status_check
  CHECK (status IN ('active', 'sold', 'expired', 'removed', 'pending_verification'));

-- 3. Add owner contact fields to user_listings for reference
ALTER TABLE public.user_listings
  ADD COLUMN IF NOT EXISTS owner_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- 4. Add reminder_sent_at to location_agreements for cron reminders
ALTER TABLE public.location_agreements
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- 5. Expand location_agreements status to include 'expired'
ALTER TABLE public.location_agreements
  DROP CONSTRAINT IF EXISTS location_agreements_status_check;

ALTER TABLE public.location_agreements
  ADD CONSTRAINT location_agreements_status_check
  CHECK (status IN ('pending', 'viewed', 'signed', 'expired'));
