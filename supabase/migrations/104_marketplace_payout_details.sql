-- Marketplace payout structure: capture bank info from placement partners so
-- payouts can be executed without an admin-vs-PP email round-trip. The
-- routing/account numbers are only ever accessed via service-role code paths
-- (see the "Service role only" RLS policy from migration 097) and Supabase
-- disk-at-rest encryption applies at the storage layer.

ALTER TABLE placement_bank_accounts
  ADD COLUMN IF NOT EXISTS routing_number text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS account_type text
    CHECK (account_type IS NULL OR account_type IN ('checking', 'savings')),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS qb_vendor_synced_at timestamptz;

-- payout method labels expanded — some partners may prefer paper checks or
-- want us to Zelle/Venmo them until their bank profile is ready.
ALTER TABLE placement_bank_accounts
  DROP CONSTRAINT IF EXISTS placement_bank_accounts_method_check;

ALTER TABLE placement_bank_accounts
  ADD CONSTRAINT placement_bank_accounts_method_check
  CHECK (method IN ('ach', 'manual_check', 'zelle', 'venmo', 'wire'));

-- Mark on the payout row when + how it was actually settled (independent of
-- QB Bill status). "paid_at" already exists; add human context.
ALTER TABLE marketplace_payouts
  ADD COLUMN IF NOT EXISTS paid_method text,
  ADD COLUMN IF NOT EXISTS paid_reference text,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES profiles(id);
