-- Phase 4 — Commissions.
--
-- Commission rules resolve a rate for (user, role, category, order_amount).
-- Resolution priority (highest wins):
--   1. per-user + per-category override
--   2. per-user override
--   3. per-role + per-category rate
--   4. per-role rate
--   5. default (system) rate
--
-- Commission ledger records every earn / reverse / hold / clear event.
-- Reversals are negative-amount rows that reference the original earn via
-- reversed_of_id. Refund and chargeback events auto-write reversals.
--
-- Amounts are basis points (bps) for rates and cents for money to avoid
-- float drift.

-- ─── Commission rules ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Matcher (nullable = "any")
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role_code text REFERENCES attribution_roles(code) ON DELETE CASCADE,
  category text,                        -- lowercased order/product category, or NULL

  -- Rate + hold
  rate_bps int NOT NULL CHECK (rate_bps >= 0 AND rate_bps <= 10000),
  hold_days int NOT NULL DEFAULT 0 CHECK (hold_days >= 0 AND hold_days <= 365),

  -- Priority: higher wins. Derived from specificity so we don't need
  -- app-level tie-breaking when two rules have equal specificity.
  --   +1000 if user_id set
  --   + 100 if role_code set
  --   +  10 if category set
  priority int NOT NULL DEFAULT 0,

  is_default boolean NOT NULL DEFAULT false,   -- the singleton fallback rate
  is_active boolean NOT NULL DEFAULT true,
  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),

  -- Prevent duplicate specifiers. NULL == NULL under UNIQUE in Postgres, so
  -- we coerce via unique index on COALESCE.
  UNIQUE NULLS NOT DISTINCT (user_id, role_code, category)
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_user ON commission_rules(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commission_rules_role ON commission_rules(role_code) WHERE role_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commission_rules_active ON commission_rules(is_active, priority DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_rules_singleton_default
  ON commission_rules((true))
  WHERE is_default = true;

-- Seed the default rule (5% flat, no hold) if not present.
INSERT INTO commission_rules (rate_bps, hold_days, is_default, priority, notes)
SELECT 500, 0, true, 0, 'System default commission rate. Edit or override per role/user/category.'
WHERE NOT EXISTS (SELECT 1 FROM commission_rules WHERE is_default = true);

-- ─── Commission ledger ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  attribution_id uuid REFERENCES sales_attributions(id) ON DELETE SET NULL,
  role_code text NOT NULL REFERENCES attribution_roles(code) ON DELETE RESTRICT,

  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES commission_rules(id) ON DELETE SET NULL,

  -- Money math
  attribution_percentage numeric(6,3) NOT NULL,   -- copy of the attribution % at earn time
  basis_cents bigint NOT NULL,                    -- payment amount × attribution % (signed)
  rate_bps int NOT NULL,                          -- rate at time of earn
  amount_cents bigint NOT NULL,                   -- commission amount, signed (negative = reversal)

  hold_days int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'earned'
    CHECK (status IN ('pending','held','earned','reversed','paid','cancelled')),

  earned_at timestamptz NOT NULL DEFAULT now(),
  clearable_at timestamptz,          -- earned_at + hold_days; when hold_days=0 == earned_at
  paid_at timestamptz,

  reversed_of_id uuid REFERENCES commission_ledger(id) ON DELETE SET NULL,
  reversal_reason text,

  notes text,
  metadata jsonb,

  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_user ON commission_ledger(user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_order ON commission_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_payment ON commission_ledger(payment_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_status ON commission_ledger(status);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_reversal ON commission_ledger(reversed_of_id) WHERE reversed_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commission_ledger_clearable ON commission_ledger(status, clearable_at)
  WHERE status IN ('held','earned');

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON commission_rules;
CREATE POLICY "Service role only" ON commission_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reps can read the active rules that apply to them or their role — populates
-- "My Commissions" explainer copy.
DROP POLICY IF EXISTS "Read applicable rules" ON commission_rules;
CREATE POLICY "Read applicable rules" ON commission_rules
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role only" ON commission_ledger;
CREATE POLICY "Service role only" ON commission_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reps read their own ledger — the whole point of the rep-facing "My
-- Commissions" page.
DROP POLICY IF EXISTS "Rep reads own commissions" ON commission_ledger;
CREATE POLICY "Rep reads own commissions" ON commission_ledger
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ─── Updated_at trigger ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_commission_rules_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commission_rules_updated_at ON commission_rules;
CREATE TRIGGER trg_commission_rules_updated_at
  BEFORE UPDATE ON commission_rules
  FOR EACH ROW EXECUTE FUNCTION touch_commission_rules_updated_at();
