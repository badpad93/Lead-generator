-- Marketplace Phase 2.3 — Operator Handoff
-- Adds:
--   1. purchase_agreements.send_to_marketplace / marketplace_contract_id
--   2. marketplace_payouts (partner side, QB Bill queue)
--   3. marketplace_operator_invoices (operator side, QB Invoice queue)
--
-- When an agreement is fully signed with send_to_marketplace = true, we
-- auto-create a Tier-1 placement_contract; operator later reviews approved
-- submissions and can Accept/Reject; on Accept we queue a QB Bill (partner
-- payout) and QB Invoice (operator billing). Phase 2.4 will wire the actual
-- QB API calls to drain those queues.

-- ─── purchase_agreements columns ─────────────────────────────────────────
ALTER TABLE purchase_agreements
  ADD COLUMN IF NOT EXISTS send_to_marketplace boolean DEFAULT false;

ALTER TABLE purchase_agreements
  ADD COLUMN IF NOT EXISTS marketplace_contract_id uuid
    REFERENCES placement_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agreements_marketplace_contract
  ON purchase_agreements(marketplace_contract_id);

-- ─── Partner payouts (QB Bill queue) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES placement_submissions(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES placement_contracts(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES placement_partners(id) ON DELETE CASCADE,
  company_id uuid REFERENCES placement_companies(id) ON DELETE SET NULL,

  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',

  -- Lifecycle: queued → sent_to_qb → paid | failed | cancelled
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent_to_qb', 'paid', 'failed', 'cancelled')),
  qb_bill_id text,        -- QuickBooks Bill id, set when sent
  qb_error text,          -- last error message from QB
  qb_last_attempt_at timestamptz,

  triggered_by uuid REFERENCES profiles(id),
  triggered_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (submission_id)
);

CREATE INDEX IF NOT EXISTS idx_payouts_partner ON marketplace_payouts(partner_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON marketplace_payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_contract ON marketplace_payouts(contract_id);

-- ─── Operator invoices (QB Invoice queue) ────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_operator_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES placement_submissions(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES placement_contracts(id) ON DELETE CASCADE,
  operator_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  operator_email text,
  operator_business_name text,

  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',

  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent_to_qb', 'paid', 'failed', 'cancelled')),
  qb_invoice_id text,
  qb_error text,
  qb_last_attempt_at timestamptz,

  triggered_by uuid REFERENCES profiles(id),
  triggered_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (submission_id)
);

CREATE INDEX IF NOT EXISTS idx_op_invoices_operator ON marketplace_operator_invoices(operator_profile_id);
CREATE INDEX IF NOT EXISTS idx_op_invoices_status ON marketplace_operator_invoices(status);
CREATE INDEX IF NOT EXISTS idx_op_invoices_contract ON marketplace_operator_invoices(contract_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE marketplace_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_operator_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON marketplace_payouts;
CREATE POLICY "Service role only" ON marketplace_payouts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role only" ON marketplace_operator_invoices;
CREATE POLICY "Service role only" ON marketplace_operator_invoices
  FOR ALL TO service_role USING (true) WITH CHECK (true);
