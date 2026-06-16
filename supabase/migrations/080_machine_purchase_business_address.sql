-- Add buyer business address fields to machine_listing_purchases
ALTER TABLE machine_listing_purchases ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE machine_listing_purchases ADD COLUMN IF NOT EXISTS business_city TEXT;
ALTER TABLE machine_listing_purchases ADD COLUMN IF NOT EXISTS business_state TEXT;
ALTER TABLE machine_listing_purchases ADD COLUMN IF NOT EXISTS business_zip TEXT;
