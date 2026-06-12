-- QuickBooks Online connection and payment tracking
-- Stores OAuth credentials for the QB connection (single-row, admin connects once)

CREATE TABLE IF NOT EXISTS quickbooks_connection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  company_name TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE quickbooks_connection ENABLE ROW LEVEL SECURITY;

-- Add QB reference columns to all payment-related tables
ALTER TABLE agreement_tokens ADD COLUMN IF NOT EXISTS qb_invoice_id TEXT;
ALTER TABLE agreement_tokens ADD COLUMN IF NOT EXISTS qb_payment_id TEXT;
ALTER TABLE agreement_tokens ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'stripe';

ALTER TABLE lead_purchases ADD COLUMN IF NOT EXISTS qb_invoice_id TEXT;
ALTER TABLE lead_purchases ADD COLUMN IF NOT EXISTS qb_payment_id TEXT;
ALTER TABLE lead_purchases ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'stripe';

ALTER TABLE machine_listing_purchases ADD COLUMN IF NOT EXISTS qb_invoice_id TEXT;
ALTER TABLE machine_listing_purchases ADD COLUMN IF NOT EXISTS qb_payment_id TEXT;
ALTER TABLE machine_listing_purchases ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'stripe';

ALTER TABLE coffee_orders ADD COLUMN IF NOT EXISTS qb_invoice_id TEXT;
ALTER TABLE coffee_orders ADD COLUMN IF NOT EXISTS qb_payment_id TEXT;
ALTER TABLE coffee_orders ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'stripe';

ALTER TABLE user_listing_purchases ADD COLUMN IF NOT EXISTS qb_invoice_id TEXT;
ALTER TABLE user_listing_purchases ADD COLUMN IF NOT EXISTS qb_payment_id TEXT;
ALTER TABLE user_listing_purchases ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'stripe';

ALTER TABLE pipeline_payments ADD COLUMN IF NOT EXISTS qb_invoice_id TEXT;
ALTER TABLE pipeline_payments ADD COLUMN IF NOT EXISTS qb_payment_id TEXT;
