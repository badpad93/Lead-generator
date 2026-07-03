-- Coffee orders auto-mirror to CRM sales_orders on payment. Adds a linkage
-- column so we can skip re-mirroring on webhook retries and so the CRM page
-- knows which coffee order it's rendering when we surface a "Source: Coffee"
-- badge later.

ALTER TABLE coffee_orders
  ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coffee_orders_sales_order_id ON coffee_orders(sales_order_id);
