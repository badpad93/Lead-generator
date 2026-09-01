-- Storefront order + line-item snapshot columns.
--
-- Per spec § "Commercial Rules":
--   operator commission = customer product price − Apex base price
--   Sales tax must never be included in operator commission.
--   All financial calculations are server-side, auditable,
--   idempotent, and historically reproducible.
--
-- To satisfy "historically reproducible" every order must snapshot
-- the four numbers that determine the commercial split at the
-- moment of purchase. Later changes to catalog tiers, tenant
-- markups, or tax config cannot rewrite history.
--
-- Money is NUMERIC(12,2) (dollars-and-cents) matching the existing
-- sales_orders convention. No integer minor units anywhere.
--
-- Idempotent — ADD COLUMN IF NOT EXISTS only.

-- ─── coffee_orders — tenant attribution ──────────────────────────
ALTER TABLE public.coffee_orders
  ADD COLUMN IF NOT EXISTS storefront_tenant_id uuid
    REFERENCES public.storefront_tenants(id) ON DELETE RESTRICT,
  -- Aggregate roll-ups from the line items, snapshotted at
  -- checkout so the order-level tile doesn't re-derive on every
  -- read. Nullable so pre-storefront orders remain valid.
  ADD COLUMN IF NOT EXISTS base_price_total    numeric(12,2),
  ADD COLUMN IF NOT EXISTS tenant_price_total  numeric(12,2),
  ADD COLUMN IF NOT EXISTS commission_total    numeric(12,2),
  ADD COLUMN IF NOT EXISTS tax_total           numeric(12,2)
    -- All storefront transactions are resale = tax-exempt at
    -- Vending Connector -> customer, so this defaults to 0 for
    -- storefront orders. Kept on the schema so a future taxable
    -- sale path can populate it without another migration.
    DEFAULT 0;

COMMENT ON COLUMN public.coffee_orders.storefront_tenant_id IS
  'Set when the order was placed through a storefront tenant. NULL = direct-to-Vending-Connector (legacy or non-storefront) order — no commission calculation applies.';

COMMENT ON COLUMN public.coffee_orders.commission_total IS
  'Sum of coffee_order_items.commission_amount at order creation. Tax is NOT included here (per spec: commission is calculated from product prices only).';

CREATE INDEX IF NOT EXISTS idx_coffee_orders_storefront_tenant
  ON public.coffee_orders(storefront_tenant_id)
  WHERE storefront_tenant_id IS NOT NULL;

-- ─── coffee_order_items — per-line financial snapshot ────────────
-- Each line captures the four numbers required to reconstruct the
-- commercial split months or years later even if catalog prices,
-- tenant tiers, or tax rules change.
ALTER TABLE public.coffee_order_items
  -- The Apex base price per unit at order time. Sourced from the
  -- tenant's assigned coffee_pricing_tiers row, or the platform
  -- fallback tier if the tenant has no tier assignment yet.
  ADD COLUMN IF NOT EXISTS base_price_per_unit    numeric(12,2),
  -- The tenant's chosen customer price per unit (either the
  -- tenant-level markup or a per-customer override). Must be
  -- >= base_price_per_unit (enforced in the pricing resolver;
  -- add a CHECK constraint here so a bug can't silently write
  -- a violating row).
  ADD COLUMN IF NOT EXISTS tenant_price_per_unit  numeric(12,2),
  -- Commission per unit = tenant_price - base_price. Written
  -- explicitly (not computed on read) so historical reporting
  -- doesn't drift if we ever change the formula.
  ADD COLUMN IF NOT EXISTS commission_per_unit    numeric(12,2),
  -- Line totals — populated at checkout by the pricing resolver.
  ADD COLUMN IF NOT EXISTS base_price_amount      numeric(12,2),
  ADD COLUMN IF NOT EXISTS tenant_price_amount    numeric(12,2),
  ADD COLUMN IF NOT EXISTS commission_amount      numeric(12,2),
  -- Tax on this line (typically 0 for resale). Kept per-line so
  -- refunds can reverse the correct amount if a mixed-taxability
  -- order type is ever introduced.
  ADD COLUMN IF NOT EXISTS tax_amount             numeric(12,2) DEFAULT 0,
  -- Reference back to the source pricing tier row so the
  -- reconciliation report can group by tier.
  ADD COLUMN IF NOT EXISTS storefront_tenant_id   uuid
    REFERENCES public.storefront_tenants(id) ON DELETE RESTRICT;

-- CHECK constraint: tenant price must not be below the Apex base
-- price at the moment of writing. This is defense in depth on top
-- of the application-layer pricing resolver — a code bug that
-- computes a bad price fails hard at INSERT instead of quietly
-- writing a commission-negative row.
--
-- Only enforced when BOTH columns are populated (legacy rows and
-- non-storefront orders leave them NULL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coffee_order_items_tenant_price_floor'
      AND conrelid = 'public.coffee_order_items'::regclass
  ) THEN
    ALTER TABLE public.coffee_order_items
      ADD CONSTRAINT coffee_order_items_tenant_price_floor
        CHECK (
          base_price_per_unit IS NULL
          OR tenant_price_per_unit IS NULL
          OR tenant_price_per_unit >= base_price_per_unit
        );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_coffee_order_items_storefront_tenant
  ON public.coffee_order_items(storefront_tenant_id)
  WHERE storefront_tenant_id IS NOT NULL;
