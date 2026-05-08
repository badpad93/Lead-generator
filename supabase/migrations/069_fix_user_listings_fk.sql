-- Migration 069: Fix user_listings foreign keys
--
-- user_listings.seller_id references auth.users(id), but every other table
-- references profiles(id). The PostgREST join `profiles!seller_id(...)` fails
-- because there is no FK path from user_listings to profiles. The same issue
-- exists for user_listing_purchases buyer_id and seller_id.
--
-- Fix: re-point the FKs to profiles(id) (which itself references auth.users(id)
-- with CASCADE, so data integrity is preserved).

-- 1. user_listings.seller_id
ALTER TABLE public.user_listings
  DROP CONSTRAINT IF EXISTS user_listings_seller_id_fkey;

ALTER TABLE public.user_listings
  ADD CONSTRAINT user_listings_seller_id_fkey
  FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. user_listing_purchases.buyer_id
ALTER TABLE public.user_listing_purchases
  DROP CONSTRAINT IF EXISTS user_listing_purchases_buyer_id_fkey;

ALTER TABLE public.user_listing_purchases
  ADD CONSTRAINT user_listing_purchases_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. user_listing_purchases.seller_id
ALTER TABLE public.user_listing_purchases
  DROP CONSTRAINT IF EXISTS user_listing_purchases_seller_id_fkey;

ALTER TABLE public.user_listing_purchases
  ADD CONSTRAINT user_listing_purchases_seller_id_fkey
  FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Enable realtime on user_listings so live-update subscriptions work
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_listings;

-- Reload PostgREST schema cache so it picks up the new relationships
NOTIFY pgrst, 'reload schema';
