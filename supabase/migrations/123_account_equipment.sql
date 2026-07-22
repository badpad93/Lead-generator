-- Account-linked equipment.
--
-- Every sales_accounts row can have zero or more pieces of equipment
-- assigned to it — a physical machine at the customer's location, a
-- coffee brewer, a POS unit, etc. Distinct from machine_listings /
-- machine_orders which model machines FOR SALE. This models machines
-- DEPLOYED at a customer account, with lightweight lifecycle: assigned
-- → active → removed.
--
-- Additive migration. No changes to existing tables.

CREATE TABLE IF NOT EXISTS account_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES sales_accounts(id) ON DELETE CASCADE,

  name text NOT NULL,                  -- e.g. "AI Vending Machine", "Bunn Coffee Brewer"
  serial_number text,
  model text,
  notes text,

  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  removed_at timestamptz,
  removed_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_equipment_account_status
  ON account_equipment(account_id, status);
CREATE INDEX IF NOT EXISTS idx_account_equipment_serial
  ON account_equipment(serial_number)
  WHERE serial_number IS NOT NULL;

ALTER TABLE account_equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON account_equipment;
CREATE POLICY "Service role only" ON account_equipment
  FOR ALL TO service_role USING (true) WITH CHECK (true);
