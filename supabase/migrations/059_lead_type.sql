-- Add lead_type to distinguish contracted (inquiry only) vs standard (buy now) leads
ALTER TABLE vending_requests
  ADD COLUMN IF NOT EXISTS lead_type text NOT NULL DEFAULT 'standard'
  CHECK (lead_type IN ('standard', 'contracted'));
