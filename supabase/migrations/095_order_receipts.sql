-- Customer receipts for orders
-- Track whether a receipt has been sent for a payment event.

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS receipt_status text DEFAULT 'not_sent'
    CHECK (receipt_status IN ('not_sent', 'sent')),
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS deposit_receipt_status text DEFAULT 'not_sent'
    CHECK (deposit_receipt_status IN ('not_sent', 'sent')),
  ADD COLUMN IF NOT EXISTS deposit_receipt_sent_at timestamptz;
