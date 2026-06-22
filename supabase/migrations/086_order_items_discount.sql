-- Add discount_percent to order_items for catalog-based pricing with discount increments

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0;
