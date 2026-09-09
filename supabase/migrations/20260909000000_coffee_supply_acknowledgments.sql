-- Phase 5C-a10.1 — durable structured storage for the coffee (Equipment
-- Loan & Beverage Supply) acknowledgments the customer checks on the
-- purchase-agreement signing page.
--
-- Model A: the operator's single signature on the machine-purchase
-- agreement also covers the captured Equipment Loan & Beverage Supply
-- Agreement. That captured agreement requires the customer to acknowledge
-- three specific obligations. These columns record that the customer
-- checked all three, and when — persisted atomically with the operator
-- signature (see the sign route). They are advisory/audit columns and do
-- NOT change the substantive captured legal text.
--
-- Nullable with no default so EVERY historical purchase_agreements row is
-- untouched: a pre-existing signed agreement keeps NULL acknowledgments
-- (it predates this requirement) rather than being back-stamped as if the
-- customer had checked boxes they never saw. coffee_supply_required=false
-- agreements never populate these.

ALTER TABLE public.purchase_agreements
  ADD COLUMN IF NOT EXISTS coffee_ack_exclusive_supply boolean,
  ADD COLUMN IF NOT EXISTS coffee_ack_minimum_purchase boolean,
  ADD COLUMN IF NOT EXISTS coffee_ack_shipping_service_return boolean,
  ADD COLUMN IF NOT EXISTS coffee_acknowledged_at timestamptz;

COMMENT ON COLUMN public.purchase_agreements.coffee_ack_exclusive_supply IS
  'Coffee (Beverage Supply) acknowledgment: exclusive supply requirement. Set true only at operator signing when coffee_supply_required.';
COMMENT ON COLUMN public.purchase_agreements.coffee_ack_minimum_purchase IS
  'Coffee acknowledgment: $1,000 per machine per month minimum purchase.';
COMMENT ON COLUMN public.purchase_agreements.coffee_ack_shipping_service_return IS
  'Coffee acknowledgment: responsibility for shipping, installation, service and return costs.';
COMMENT ON COLUMN public.purchase_agreements.coffee_acknowledged_at IS
  'Timestamp the three coffee acknowledgments were captured, atomically with the operator signature.';
