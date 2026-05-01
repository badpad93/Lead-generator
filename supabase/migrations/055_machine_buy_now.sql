-- Add buy-now fields to machine_listings (admin-only Stripe checkout)
ALTER TABLE machine_listings
  ADD COLUMN IF NOT EXISTS buy_now_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buy_now_price integer; -- price in cents
