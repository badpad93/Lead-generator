-- Financial spine — Phase 1
-- Canonical payment ledger + provider-agnostic invoice model + verified
-- webhook event log + universal financial audit trail. All additive: existing
-- tables (sales_orders, purchase_agreements, lead_purchases, coffee_orders,
-- machine_listing_purchases, user_listing_purchases, pipeline_payments,
-- marketplace_payouts, marketplace_operator_invoices, agreement_tokens) are
-- untouched. Cross-references let backfill wire them to the new spine without
-- rewriting the old flows.
--
-- RLS on new tables:
--   - service_role writes everything (webhook + API layer)
--   - authenticated users can SELECT rows tagged with their user_id for the
--     "My Performance" / "My Commissions" pages (rep dashboards)
--   - admin-only sums live behind service-role views that only the admin API
--     layer touches
--
-- Anything the sales rep should NOT be able to see (company gross, other
-- reps' payments, aggregate revenue) stays behind service_role by omission.

-- ─── Universal audit log ─────────────────────────────────────────────────
-- One table for every financial override, rate change, attribution change,
-- refund entry, manual payment. Explicit "before" / "after" JSONB so we can
-- audit the mutation exactly.
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id),
  action text NOT NULL,             -- e.g. "manual_payment_recorded", "attribution_override"
  entity_type text NOT NULL,        -- "payment" | "invoice" | "commission_rule" | ...
  entity_id uuid,
  reason text,
  before jsonb,
  after jsonb,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- ─── Webhook event log ───────────────────────────────────────────────────
-- Every provider event lands here first with signature verification result +
-- raw payload. Downstream handlers only fire on the transition from
-- processed_at IS NULL → set, so retries + double-deliveries are safe.
CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,           -- 'stripe' | 'quickbooks' | 'paypal' | 'manual'
  event_id text NOT NULL,           -- provider's own event / message id
  event_type text NOT NULL,         -- 'checkout.session.completed', 'Payment', etc
  signature_verified boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_unprocessed ON payment_events(received_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON payment_events(provider, event_type, received_at DESC);

-- ─── Canonical invoices ──────────────────────────────────────────────────
-- Provider-agnostic invoice record. `provider_invoice_id` maps to whatever
-- the underlying system uses: QB Invoice.Id, Stripe checkout_session.id,
-- Stripe invoice.id (for subs), or manual. Existing sales_orders.qb_invoice_id
-- can be foreign-referenced here at backfill time.
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider identity
  provider text NOT NULL,           -- 'stripe' | 'quickbooks' | 'manual'
  provider_invoice_id text,
  provider_invoice_url text,        -- link the customer can click to pay

  -- CRM linkage (nullable — some flows don't have an order/agreement)
  order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL,
  agreement_id uuid REFERENCES purchase_agreements(id) ON DELETE SET NULL,
  account_id uuid REFERENCES sales_accounts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES sales_leads(id) ON DELETE SET NULL,

  -- Buyer
  buyer_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  buyer_email text,
  buyer_name text,

  -- Amounts stored as cents to avoid float drift
  subtotal_cents bigint NOT NULL DEFAULT 0,
  tax_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  amount_paid_cents bigint NOT NULL DEFAULT 0,
  balance_due_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',

  -- Lifecycle
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','open','partially_paid','paid','overdue','void','written_off')),
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,

  memo text,
  metadata jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),

  UNIQUE (provider, provider_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_agreement ON invoices(agreement_id);
CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_buyer ON invoices(buyer_profile_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date) WHERE status IN ('open','partially_paid','overdue');

-- ─── Canonical payments ──────────────────────────────────────────────────
-- Single source of truth for what actually got collected. Every payment
-- (real webhook, manual admin entry, refund) is a row here. Refunds are
-- negative-amount rows referencing the parent payment_id.
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  provider text NOT NULL,            -- 'stripe' | 'quickbooks' | 'paypal' | 'manual'
  provider_payment_id text,
  provider_charge_id text,
  event_id uuid REFERENCES payment_events(id) ON DELETE SET NULL,

  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL,
  agreement_id uuid REFERENCES purchase_agreements(id) ON DELETE SET NULL,
  account_id uuid REFERENCES sales_accounts(id) ON DELETE SET NULL,

  buyer_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  buyer_email text,

  -- Signed amount. Refunds/chargebacks are negative.
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'USD',

  method text,                       -- 'card' | 'ach' | 'wire' | 'check' | 'cash' | 'zelle' | 'venmo' | 'paypal'
  last4 text,

  -- Lifecycle. Historical status_history captures transitions; this is the
  -- current state.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft','pending','paid','partial_refund','refunded','failed','disputed','chargeback','cancelled','written_off')),

  -- Refund linkage
  refund_of_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  refund_reason text,

  -- Fees the processor withheld — for later net-revenue math
  provider_fee_cents bigint DEFAULT 0,

  failed_reason text,
  failed_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  disputed_at timestamptz,

  -- Manual entries capture the proof + admin who filed it
  manual_reference text,
  proof_url text,
  proof_bucket text,
  proof_path text,

  metadata jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),

  UNIQUE (provider, provider_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_agreement ON payments(agreement_id);
CREATE INDEX IF NOT EXISTS idx_payments_status_paid_at ON payments(status, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_buyer ON payments(buyer_profile_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON payments(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_refund_of ON payments(refund_of_payment_id);

-- ─── Payment allocations ─────────────────────────────────────────────────
-- Splits a single payment across invoice / order_items when needed
-- (deposit vs remaining, multi-invoice batch).
CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  order_item_id uuid REFERENCES order_items(id) ON DELETE SET NULL,
  amount_cents bigint NOT NULL,
  memo text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alloc_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_alloc_invoice ON payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_alloc_order_item ON payment_allocations(order_item_id);

-- ─── Payment / invoice status history ────────────────────────────────────
-- Append-only. Every status transition on a payment or invoice writes one
-- row so we can prove the timeline in reconciliation + audit views.
CREATE TABLE IF NOT EXISTS payment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text,
  event_id uuid REFERENCES payment_events(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES profiles(id),
  changed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_hist_payment ON payment_status_history(payment_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_hist_invoice ON payment_status_history(invoice_id, changed_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_status_history ENABLE ROW LEVEL SECURITY;

-- Service role can do anything on all six.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'audit_logs','payment_events','invoices','payments','payment_allocations','payment_status_history'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Service role only" ON %I;', t);
    EXECUTE format('CREATE POLICY "Service role only" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;

-- Buyers (operators/customers) can SELECT their own invoices + their own
-- payments through the anon client. Useful for /account/invoices and
-- /account/receipts pages that hit Supabase directly.
DROP POLICY IF EXISTS "Buyer reads own invoices" ON invoices;
CREATE POLICY "Buyer reads own invoices" ON invoices
  FOR SELECT TO authenticated
  USING (buyer_profile_id = auth.uid());

DROP POLICY IF EXISTS "Buyer reads own payments" ON payments;
CREATE POLICY "Buyer reads own payments" ON payments
  FOR SELECT TO authenticated
  USING (buyer_profile_id = auth.uid());

-- Notably absent (by design):
--   - No auth policy for payment_events / audit_logs — admin only via API
--   - No auth policy for payment_allocations / payment_status_history —
--     surfaced through API views, never direct DB reads
--   - No rep-visibility policy here — those get added in the commissions
--     phase (Phase 4), scoped to commission_ledger rows only

-- ─── Storage: payment-proofs ─────────────────────────────────────────────
-- Private bucket for manual payment proof uploads (screenshots, PDFs of
-- ACH confirmations, etc). Only served through the admin API via short-
-- lived signed URLs — never public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- ─── Backfill safety pins ────────────────────────────────────────────────
-- These columns let the backfill script mark rows as "already reconciled to
-- the new spine" without touching existing status flags.
ALTER TABLE lead_purchases
  ADD COLUMN IF NOT EXISTS financial_spine_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS financial_spine_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL;

ALTER TABLE machine_listing_purchases
  ADD COLUMN IF NOT EXISTS financial_spine_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS financial_spine_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL;

ALTER TABLE coffee_orders
  ADD COLUMN IF NOT EXISTS financial_spine_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS financial_spine_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL;

ALTER TABLE user_listing_purchases
  ADD COLUMN IF NOT EXISTS financial_spine_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS financial_spine_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL;

ALTER TABLE pipeline_payments
  ADD COLUMN IF NOT EXISTS financial_spine_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS financial_spine_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL;

ALTER TABLE agreement_tokens
  ADD COLUMN IF NOT EXISTS financial_spine_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS financial_spine_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL;

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS financial_spine_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;
