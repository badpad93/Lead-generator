-- Marketplace Phase 2.4 — QuickBooks Vendor/Customer cache references
--
-- We cache the QB Vendor ID on placement_partners and the QB Customer ID on
-- profiles so the drain worker doesn't need to do a NAME lookup for every
-- payout / invoice push. All fields nullable + idempotent.

ALTER TABLE placement_partners
  ADD COLUMN IF NOT EXISTS qb_vendor_id text,
  ADD COLUMN IF NOT EXISTS qb_vendor_created_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_partners_qb_vendor ON placement_partners(qb_vendor_id);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS qb_customer_id text,
  ADD COLUMN IF NOT EXISTS qb_customer_created_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_qb_customer ON profiles(qb_customer_id);
