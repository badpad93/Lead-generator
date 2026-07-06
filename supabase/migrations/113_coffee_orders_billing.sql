-- Coffee orders — collect billing information alongside shipping.
--
-- All billing_* columns are nullable at the DB level so existing rows don't
-- break, but the API POST enforces them for every NEW order.

ALTER TABLE coffee_orders
  ADD COLUMN IF NOT EXISTS billing_business_name text,
  ADD COLUMN IF NOT EXISTS billing_contact_name text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_phone text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS billing_state text,
  ADD COLUMN IF NOT EXISTS billing_zip text,
  ADD COLUMN IF NOT EXISTS shipping_business_name text;

-- Business name is now mandatory on the ship-to side too.
COMMENT ON COLUMN coffee_orders.shipping_business_name IS
  'Ship-to business name. Required for every new order at the API layer.';
COMMENT ON COLUMN coffee_orders.billing_business_name IS
  'Bill-to business/legal entity name. Required for every new order at the API layer.';
