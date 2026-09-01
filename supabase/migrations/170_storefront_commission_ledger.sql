-- Storefront commission ledger — parallel to commission_ledger.
--
-- The existing commission_ledger (migration 109) tracks sales-team
-- attribution commissions on sales_orders and stores money as
-- bigint amount_cents. Storefront tenant commissions come from
-- coffee_orders + coffee_order_items, use NUMERIC(12,2)
-- (dollars-and-cents) per operator direction, and require
-- settlement-gated status transitions the existing ledger doesn't
-- model. Two orthogonal financial flows deserve two orthogonal
-- ledgers — reconciliation, reporting, and refund reversal each
-- run on their own primitives.
--
-- Per spec § "Operator Commission Ledger":
--   - Authorization alone does not create payable earnings.
--   - Earnings become payable when funds settle.
--   - Full refunds reverse the corresponding commission.
--   - Partial refunds reverse commission based on refunded items
--     and their original pricing snapshots.
--   - Chargebacks place related earnings on hold or reverse them.
--   - Financial records must be idempotent and traceable to
--     payment events.
--
-- Status lifecycle enforced by the CHECK constraint:
--   pending           — commission written at order creation but
--                       payment not yet settled (default).
--   payable           — payment webhook confirmed settlement; row
--                       is eligible for the next payout batch.
--   scheduled         — payout batch has picked this row up; QB
--                       bill in flight.
--   paid              — payout confirmed by QB / bank.
--   reversed          — full refund or chargeback wiped this row;
--                       linked to a negative-amount reversal row
--                       via reversed_of_id.
--   on_hold           — admin held the row (dispute, review, etc.).
--   cancelled         — order cancelled before settlement; row is
--                       tombstoned.

CREATE TABLE IF NOT EXISTS public.storefront_commission_ledger (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Attribution
  tenant_id                   uuid NOT NULL REFERENCES public.storefront_tenants(id) ON DELETE RESTRICT,
  customer_profile_id         uuid NOT NULL REFERENCES public.profiles(id)           ON DELETE RESTRICT,

  -- Source lines — one ledger row per order (aggregate) or per
  -- order item (line-level). We ship line-level to keep partial-
  -- refund reversal exact: an order-level row can't be reversed
  -- for just one refunded line.
  coffee_order_id             uuid NOT NULL REFERENCES public.coffee_orders(id)      ON DELETE CASCADE,
  coffee_order_item_id        uuid NOT NULL REFERENCES public.coffee_order_items(id) ON DELETE CASCADE,

  -- Payment linkage. The QB Payments webhook stamps
  -- settled_payment_ref_id + settled_at when funds clear, which
  -- is the trigger for the pending -> payable transition.
  qb_invoice_id               text,     -- QBO invoice ref (denormalized for reporting)
  qb_payment_id               text,     -- QB Payments charge id
  settled_payment_ref_id      text,     -- authoritative settlement ref from QB webhook
  settled_at                  timestamptz,

  -- Money — NUMERIC(12,2). All fields signed so a reversal row
  -- carries negative values.
  base_price_amount           numeric(12,2) NOT NULL,
  tenant_price_amount         numeric(12,2) NOT NULL,
  commission_amount           numeric(12,2) NOT NULL,
  -- Denormalized quantity so reports don't have to join the item
  -- row back in for a per-unit view.
  quantity                    numeric(10,2) NOT NULL DEFAULT 1,

  -- Lifecycle
  status                      text NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','payable','scheduled','paid','reversed','on_hold','cancelled')),
  earned_at                   timestamptz NOT NULL DEFAULT now(),
  payable_at                  timestamptz,
  scheduled_at                timestamptz,
  paid_at                     timestamptz,

  -- Payout linkage — set when the row is bundled into a QB Bill
  -- that gets paid via QB Bill Pay / ACH.
  qb_bill_id                  text,
  qb_bill_payment_id          text,

  -- Reversal chain — full or partial refund creates a NEW row
  -- with negative amounts pointing back at the original via
  -- reversed_of_id. We never edit the original row; the ledger
  -- is append-only.
  reversed_of_id              uuid REFERENCES public.storefront_commission_ledger(id) ON DELETE RESTRICT,
  reversal_reason             text,

  -- Idempotency key so a duplicate payment webhook doesn't
  -- double-post a row. Format:
  --   settle:{payment_id}:{order_item_id}
  --   refund:{refund_id}:{order_item_id}
  --   adjust:{admin_id}:{order_item_id}:{iso_ts}
  idempotency_key             text UNIQUE,

  -- Audit
  notes                       text,
  metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storefront_commissions_tenant
  ON public.storefront_commission_ledger(tenant_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_commissions_customer
  ON public.storefront_commission_ledger(customer_profile_id);
CREATE INDEX IF NOT EXISTS idx_storefront_commissions_order
  ON public.storefront_commission_ledger(coffee_order_id);
CREATE INDEX IF NOT EXISTS idx_storefront_commissions_status
  ON public.storefront_commission_ledger(status);
CREATE INDEX IF NOT EXISTS idx_storefront_commissions_reversal
  ON public.storefront_commission_ledger(reversed_of_id)
  WHERE reversed_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storefront_commissions_payable
  ON public.storefront_commission_ledger(tenant_id, status)
  WHERE status IN ('payable','scheduled');

CREATE OR REPLACE FUNCTION public.storefront_commission_ledger_touch()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_storefront_commission_ledger_touch ON public.storefront_commission_ledger;
CREATE TRIGGER trg_storefront_commission_ledger_touch
  BEFORE UPDATE ON public.storefront_commission_ledger
  FOR EACH ROW EXECUTE FUNCTION public.storefront_commission_ledger_touch();

ALTER TABLE public.storefront_commission_ledger ENABLE ROW LEVEL SECURITY;

-- Ledger writes go through service role (checkout, webhook,
-- admin adjustments) — no client write policies. Tenant owner
-- reads their own tenant's rows; admins read all.
DROP POLICY IF EXISTS "Owner reads tenant ledger" ON public.storefront_commission_ledger;
CREATE POLICY "Owner reads tenant ledger"
  ON public.storefront_commission_ledger FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM storefront_tenants t
    WHERE t.id = tenant_id AND t.owner_profile_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Admins read all ledger" ON public.storefront_commission_ledger;
CREATE POLICY "Admins read all ledger"
  ON public.storefront_commission_ledger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Convenient view: current payable balance per tenant. Used by
-- the tenant dashboard + admin console. A view is safe because
-- the underlying table is RLS-protected.
CREATE OR REPLACE VIEW public.storefront_commission_balances AS
SELECT
  tenant_id,
  count(*)                                     AS row_count,
  count(*) FILTER (WHERE status = 'pending')   AS pending_rows,
  count(*) FILTER (WHERE status = 'payable')   AS payable_rows,
  count(*) FILTER (WHERE status = 'scheduled') AS scheduled_rows,
  count(*) FILTER (WHERE status = 'paid')      AS paid_rows,
  count(*) FILTER (WHERE status = 'reversed')  AS reversed_rows,
  coalesce(sum(commission_amount) FILTER (WHERE status = 'pending'),   0) AS pending_amount,
  coalesce(sum(commission_amount) FILTER (WHERE status = 'payable'),   0) AS payable_amount,
  coalesce(sum(commission_amount) FILTER (WHERE status = 'scheduled'), 0) AS scheduled_amount,
  coalesce(sum(commission_amount) FILTER (WHERE status = 'paid'),      0) AS paid_amount,
  coalesce(sum(commission_amount) FILTER (WHERE status = 'reversed'),  0) AS reversed_amount,
  coalesce(sum(commission_amount),                                     0) AS lifetime_net
FROM public.storefront_commission_ledger
GROUP BY tenant_id;

COMMENT ON VIEW public.storefront_commission_balances IS
  'Per-tenant commission balance roll-up. Sums signed commission_amount grouped by status. Reversal rows are already negative so lifetime_net is truthful.';
