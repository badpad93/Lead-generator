-- ==========================================================
-- Customer-facing tracking number on every coffee order.
--
-- Quoted in the order-confirmation email and to support on the
-- phone ("call (888) 851-1462 and give your tracking number").
-- Format: VC- followed by 8 unambiguous characters. New orders
-- get theirs generated at checkout; existing orders are
-- backfilled deterministically from the row id so support can
-- look up ANY historical order a customer calls about.
-- ==========================================================

ALTER TABLE coffee_orders
  ADD COLUMN IF NOT EXISTS tracking_number text;

UPDATE coffee_orders
   SET tracking_number = 'VC-' || upper(substr(md5(id::text), 1, 8))
 WHERE tracking_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_coffee_orders_tracking_number
  ON coffee_orders (tracking_number)
  WHERE tracking_number IS NOT NULL;
