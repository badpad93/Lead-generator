-- Add per-product shipping cost to coffee products
ALTER TABLE coffee_products ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0;
