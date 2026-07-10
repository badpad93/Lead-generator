-- Lead Generator access control.
--
-- Business rule (finalized with product):
--   FREE ACCESS (source='role_based'):
--     admin, sales, sales_manager, director_of_sales, market_leader,
--     placement_partner, locator, or any user holding an active
--     placement_partners row (dual-role via marketplace onboarding).
--   PAID ACCESS ($9.99/mo, source='subscription'):
--     operator (without a PP row), location_manager, requestor.
--   HIDDEN (no nav, no route): everyone else — admin can grant manually.
--
-- CRM access is a SEPARATE entitlement — Lead Generator access must
-- never imply CRM access. Placement Providers get LG + zero CRM.
--
-- Recurring rails: QuickBooks (Recurring Sales Receipts preferred if QB
-- Payments enabled, fallback to Recurring Invoices). Subscription state
-- machine lives in lead_generator_subscriptions; entitlement rows live
-- in account_entitlements so future entitlement kinds (e.g. coffee
-- proposal exports) can slot into the same table.

-- ═════════════════════════════════════════════════════════════════════
-- account_entitlements — generic per-user, per-key entitlement rows
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS account_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  source text NOT NULL CHECK (source IN (
    'role_based',
    'subscription',
    'admin_override'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'inactive',
    'suspended',
    'revoked'
  )),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entitlement_key)
);

CREATE INDEX IF NOT EXISTS idx_account_entitlements_user_active
  ON account_entitlements(user_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_account_entitlements_key
  ON account_entitlements(entitlement_key, status);

COMMENT ON COLUMN account_entitlements.source IS
  'role_based = free by profile.role or PP membership. subscription = paid via QB recurring. admin_override = manually granted or revoked by admin.';

-- ═════════════════════════════════════════════════════════════════════
-- lead_generator_subscriptions — QB-backed recurring subscription state
-- ═════════════════════════════════════════════════════════════════════
-- Tracks the QB Recurring Sales Receipt (or Recurring Invoice) that
-- backs a user's $9.99/mo Lead Generator subscription. Our own state
-- machine — QB webhooks advance current_period_end on paid events;
-- cron flips to past_due when period lapses.

CREATE TABLE IF NOT EXISTS lead_generator_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'quickbooks',
  provider_customer_id text,            -- QB Customer ID
  provider_subscription_id text,        -- QB Recurring template ID
  provider_receipt_kind text            -- 'sales_receipt' | 'invoice'
    CHECK (provider_receipt_kind IN ('sales_receipt', 'invoice')),
  last_payment_id text,                 -- Last QB Payment / SalesReceipt txn id
  amount_cents integer NOT NULL DEFAULT 999,   -- $9.99 = 999 cents (this table stores cents so integers don't drift; entitlement is boolean)
  status text NOT NULL DEFAULT 'incomplete' CHECK (status IN (
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'unpaid',
    'canceled'
  )),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)   -- one live subscription per user; canceled rows stay for history via status
);

CREATE INDEX IF NOT EXISTS idx_lg_subs_status
  ON lead_generator_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_lg_subs_qb_sub
  ON lead_generator_subscriptions(provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lg_subs_qb_customer
  ON lead_generator_subscriptions(provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lg_subs_period_end
  ON lead_generator_subscriptions(current_period_end)
  WHERE status IN ('active', 'past_due');

-- ═════════════════════════════════════════════════════════════════════
-- Backfill role-based entitlement rows for free-access users
-- ═════════════════════════════════════════════════════════════════════
-- Idempotent — UNIQUE (user_id, entitlement_key) protects against
-- re-runs. Operator, location_manager, requestor are intentionally
-- left with no row so the resolver returns "requires subscription".
--
-- Anyone with an active placement_partners row also gets free access,
-- regardless of primary profile.role — captures the dual-role case.

INSERT INTO account_entitlements (user_id, entitlement_key, source, status, metadata)
SELECT
  p.id,
  'lead_generator_access',
  'role_based',
  'active',
  jsonb_build_object('reason', 'role_' || p.role)
FROM profiles p
WHERE p.role IN (
  'admin',
  'sales',
  'sales_manager',
  'director_of_sales',
  'market_leader',
  'placement_partner',
  'locator'
)
ON CONFLICT (user_id, entitlement_key) DO NOTHING;

-- Dual-role: PP row exists but primary role is something else.
INSERT INTO account_entitlements (user_id, entitlement_key, source, status, metadata)
SELECT
  pp.id,
  'lead_generator_access',
  'role_based',
  'active',
  jsonb_build_object('reason', 'placement_partner_row')
FROM placement_partners pp
WHERE pp.active IS NOT FALSE
ON CONFLICT (user_id, entitlement_key) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════
-- Service-role only for writes. Callers can read their own entitlement
-- rows so client code can render "subscription active" state without a
-- server round-trip; the full subscriptions table stays admin-only.

ALTER TABLE account_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_generator_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON account_entitlements;
CREATE POLICY "Service role only" ON account_entitlements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Self read entitlements" ON account_entitlements;
CREATE POLICY "Self read entitlements" ON account_entitlements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role only" ON lead_generator_subscriptions;
CREATE POLICY "Service role only" ON lead_generator_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Self read subscription" ON lead_generator_subscriptions;
CREATE POLICY "Self read subscription" ON lead_generator_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════
-- Verification query — run manually after migration to confirm the cut
-- ═════════════════════════════════════════════════════════════════════
--
-- SELECT
--   (SELECT COUNT(*) FROM account_entitlements
--     WHERE entitlement_key = 'lead_generator_access' AND status = 'active') AS active_lg_entitlements,
--   (SELECT COUNT(*) FROM profiles WHERE role = 'admin') AS admins,
--   (SELECT COUNT(*) FROM profiles WHERE role IN ('sales','sales_manager','director_of_sales','market_leader')) AS sales_family,
--   (SELECT COUNT(*) FROM profiles WHERE role = 'placement_partner') AS placement_partners,
--   (SELECT COUNT(*) FROM profiles WHERE role IN ('operator','location_manager','requestor')) AS payment_gated,
--   (SELECT COUNT(*) FROM lead_generator_subscriptions WHERE status = 'active') AS active_subs;
