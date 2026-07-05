-- Per-order + per-line commission overrides.
--
-- Two new resolution tiers on top of the existing user/role/category rule
-- chain:
--   1. order_items.commission_rate_bps_override → line-level rate.
--   2. sales_orders.commission_rate_bps_override → order-level rate.
-- Line beats order; order beats rule chain; rule chain beats default.
--
-- commission_ledger gets an optional order_item_id so each line's earn is
-- traceable independently. When no line override exists on any item, the
-- earn function keeps the old whole-order behavior (one row per attribution)
-- for smaller ledger size.

-- ─── Order-level override ───────────────────────────────────────────────
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS commission_rate_bps_override int
    CHECK (commission_rate_bps_override IS NULL OR (commission_rate_bps_override >= 0 AND commission_rate_bps_override <= 10000)),
  ADD COLUMN IF NOT EXISTS commission_override_note text,
  ADD COLUMN IF NOT EXISTS commission_override_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS commission_override_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sales_orders_commission_override
  ON sales_orders(commission_rate_bps_override)
  WHERE commission_rate_bps_override IS NOT NULL;

-- ─── Line-level override ────────────────────────────────────────────────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS commission_rate_bps_override int
    CHECK (commission_rate_bps_override IS NULL OR (commission_rate_bps_override >= 0 AND commission_rate_bps_override <= 10000)),
  ADD COLUMN IF NOT EXISTS commission_override_note text;

CREATE INDEX IF NOT EXISTS idx_order_items_commission_override
  ON order_items(order_id)
  WHERE commission_rate_bps_override IS NOT NULL;

-- ─── Commission ledger: track per-line origin ───────────────────────────
ALTER TABLE commission_ledger
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commission_ledger_order_item
  ON commission_ledger(order_item_id)
  WHERE order_item_id IS NOT NULL;
