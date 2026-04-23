-- Add urgent flag to sales_leads
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false;
