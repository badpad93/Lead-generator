-- Fix: Remove overly permissive RLS policies from migration 066.
-- These policies used FOR ALL / USING (true) without a TO service_role
-- restriction, meaning ANY authenticated user could update/delete any
-- listing or purchase record. The supabase service role key bypasses
-- RLS by design, so these policies were both unnecessary and dangerous.

DROP POLICY IF EXISTS "Service role full access to user_listings" ON user_listings;
DROP POLICY IF EXISTS "Service role full access to user_listing_purchases" ON user_listing_purchases;
