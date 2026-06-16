-- Add deposit tracking to sales_leads for location services
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS qb_invoice_id TEXT;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS deposit_status TEXT DEFAULT 'none';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS deposit_amount_cents INTEGER;
