-- Add Stripe columns to coffee_orders
ALTER TABLE coffee_orders ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
ALTER TABLE coffee_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

-- Update status check to include awaiting_payment
ALTER TABLE coffee_orders DROP CONSTRAINT IF EXISTS coffee_orders_status_check;
ALTER TABLE coffee_orders ADD CONSTRAINT coffee_orders_status_check
  CHECK (status IN ('awaiting_payment', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'));
