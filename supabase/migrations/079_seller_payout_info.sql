-- Add seller payout info to profiles and payout tracking to purchases

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_method TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_bank_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_routing_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_account_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_notes TEXT;

ALTER TABLE user_listing_purchases ADD COLUMN IF NOT EXISTS payout_status TEXT DEFAULT 'pending';
ALTER TABLE user_listing_purchases ADD COLUMN IF NOT EXISTS payout_method TEXT;
ALTER TABLE user_listing_purchases ADD COLUMN IF NOT EXISTS payout_reference TEXT;
ALTER TABLE user_listing_purchases ADD COLUMN IF NOT EXISTS payout_completed_at TIMESTAMPTZ;
