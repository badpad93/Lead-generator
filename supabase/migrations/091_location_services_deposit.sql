-- Location Services deposit-only option

ALTER TABLE purchase_agreements
  ADD COLUMN IF NOT EXISTS location_services_deposit_only boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_services_deposit_amount numeric DEFAULT 100;

-- Track remaining-balance invoice on the order created from the agreement
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS location_remaining_invoice_status text DEFAULT 'not_sent'
    CHECK (location_remaining_invoice_status IN ('not_sent', 'sent', 'paid')),
  ADD COLUMN IF NOT EXISTS location_remaining_invoice_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_remaining_qb_invoice_id text;
