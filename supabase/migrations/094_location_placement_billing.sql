-- Location Placement Agreement billing
-- Apex bills the operator for finding/placing the location.
-- The fee is shown to the operator + internal team, hidden from the location.

ALTER TABLE purchase_agreements
  ADD COLUMN IF NOT EXISTS apex_placement_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apex_placement_fee_notes text,
  ADD COLUMN IF NOT EXISTS apex_placement_invoice_status text DEFAULT 'not_sent'
    CHECK (apex_placement_invoice_status IN ('not_sent', 'sent', 'paid', 'void')),
  ADD COLUMN IF NOT EXISTS apex_placement_invoice_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS apex_placement_qb_invoice_id text;
