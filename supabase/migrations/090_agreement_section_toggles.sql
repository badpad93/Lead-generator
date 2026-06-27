-- Agreement section toggles and auto-invoice option

ALTER TABLE purchase_agreements
  ADD COLUMN IF NOT EXISTS include_equipment boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_location_services boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_shipping_storage boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_send_invoice_on_signing boolean DEFAULT false;
