-- Migration 137: Inventory & Procurement — Phase 1 foundation
--
-- Lays down the entire tables-you-need footprint for the coffee (and
-- eventually AI-machine / equipment) inventory and procurement system.
-- Only the write paths for the ledger are built in Phase 1; the tables
-- themselves already carry every column later phases will need so we
-- never migrate destructively.
--
-- Design commitments this migration encodes:
--   1. The ledger (inventory_transactions) is APPEND-ONLY. Every change
--      is a new row. On-hand is computed by aggregation, never mutated.
--   2. Physical counts don't overwrite — they insert a count_adjustment
--      whose qty_delta = counted - computed_on_hand.
--   3. Suppliers and SKUs are decoupled. Same sku_id can be purchased
--      from any supplier over time; PO carries the supplier_id.
--   4. Forecast engine config lives in inventory_configuration (single
--      row) so future formula versions are DB-configurable, not code.
--   5. Everything is warehouse-scoped from day one; multi-warehouse UX
--      is a Phase 7 concern but the schema doesn't need changing then.

-- ── warehouses ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.warehouses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  code         text UNIQUE,
  address      text,
  active       boolean NOT NULL DEFAULT true,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.profiles(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.warehouses (name, code, active)
VALUES ('Primary Warehouse', 'WH-01', true)
ON CONFLICT (code) DO NOTHING;

-- ── suppliers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  contact_name       text,
  contact_email      text,
  contact_phone      text,
  address            text,
  -- Default lead time for POs against this supplier. SKUs can override.
  lead_time_days     integer NOT NULL DEFAULT 7,
  minimum_order_qty  integer,
  payment_terms      text,
  notes              text,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.profiles(id),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_active
  ON public.suppliers (active) WHERE active = true;

-- ── inventory_skus ──────────────────────────────────────────────────
-- Canonical SKU record for anything that can be counted / bought /
-- consumed. Coffee marketplace products (coffee_products) get a 1:1
-- inventory_skus row via coffee_product_id; AI machines / equipment
-- can later hang off this same table with different category values.
CREATE TABLE IF NOT EXISTS public.inventory_skus (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code                  text UNIQUE NOT NULL,
  name                      text NOT NULL,
  description               text,
  category                  text NOT NULL DEFAULT 'other',
  unit_of_measure           text NOT NULL DEFAULT 'each',
  pack_size                 integer NOT NULL DEFAULT 1
    CHECK (pack_size >= 1),

  -- Optional link to the marketplace product this SKU represents. When
  -- present, coffee-order consumption resolves through this column.
  coffee_product_id         uuid REFERENCES public.coffee_products(id) ON DELETE SET NULL,

  -- Default supplier + per-SKU overrides.
  preferred_supplier_id     uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  lead_time_days_override   integer,

  -- Forecast overrides — null means "use inventory_configuration
  -- global default". Kept per-SKU so a single high-variance product
  -- can flip to weighted while the rest stay simple.
  safety_stock_pct_override numeric(5,4)
    CHECK (safety_stock_pct_override IS NULL OR safety_stock_pct_override BETWEEN 0 AND 1),
  lookback_weeks_override   integer
    CHECK (lookback_weeks_override IS NULL OR lookback_weeks_override BETWEEN 6 AND 12),
  forecast_method_override  text
    CHECK (forecast_method_override IS NULL OR forecast_method_override IN ('simple','weighted')),

  active                    boolean NOT NULL DEFAULT true,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES public.profiles(id),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_skus_active
  ON public.inventory_skus (active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_inventory_skus_coffee_product
  ON public.inventory_skus (coffee_product_id) WHERE coffee_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_skus_supplier
  ON public.inventory_skus (preferred_supplier_id) WHERE preferred_supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_skus_category
  ON public.inventory_skus (category);

-- ── inventory_configuration ─────────────────────────────────────────
-- Single-row config table. All defaults live here rather than being
-- hard-coded so a formula change is a DB update, not a code deploy.
-- New formula versions bump current_formula_version; historical
-- recommendations retain the version they were computed with.
CREATE TABLE IF NOT EXISTS public.inventory_configuration (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_lookback_weeks      integer NOT NULL DEFAULT 8
    CHECK (default_lookback_weeks BETWEEN 6 AND 12),
  default_safety_stock_pct    numeric(5,4) NOT NULL DEFAULT 0.10
    CHECK (default_safety_stock_pct BETWEEN 0 AND 1),
  default_order_cycle_days    integer NOT NULL DEFAULT 7
    CHECK (default_order_cycle_days > 0),
  default_forecast_method     text NOT NULL DEFAULT 'simple'
    CHECK (default_forecast_method IN ('simple','weighted')),
  -- Weight buckets stored as JSONB so different distributions or more
  -- than two buckets can be supported without a schema change.
  -- Seeded 65/35 across the two most-recent halves of the lookback.
  default_weight_config       jsonb NOT NULL DEFAULT
    '[{"weeks_back_from":1,"weeks_back_to":4,"weight":0.65},{"weeks_back_from":5,"weeks_back_to":8,"weight":0.35}]'::jsonb,
  current_formula_version     integer NOT NULL DEFAULT 1
    CHECK (current_formula_version >= 1),
  -- Spike-detection threshold — flags a week whose usage exceeds this
  -- multiple of the median.
  spike_threshold_multiplier  numeric(4,2) NOT NULL DEFAULT 2.5,
  -- Minimum valid weeks before the engine will produce a non-flagged
  -- recommendation.
  min_valid_weeks             integer NOT NULL DEFAULT 4,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES public.profiles(id)
);

-- Seed the single config row.
INSERT INTO public.inventory_configuration (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_configuration);

-- ── inventory_transactions (THE LEDGER) ─────────────────────────────
-- Append-only. Never UPDATE or DELETE a row here. Corrections are new
-- rows with reversing qty_delta and a reference to the original.
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id           uuid NOT NULL REFERENCES public.inventory_skus(id) ON DELETE RESTRICT,
  warehouse_id     uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (transaction_type IN (
    'initial_balance',      -- opening balance / rollout seed
    'receipt',              -- PO receipt (partial or full)
    'consumption',          -- coffee_order fulfillment
    'consumption_reversal', -- coffee_order cancelled after fulfill
    'spoilage',
    'waste',
    'damage',
    'return',               -- customer return back to warehouse
    'manual_adjustment',    -- admin correction with reason
    'count_adjustment',     -- physical count reconciliation
    'transfer_out',
    'transfer_in'
  )),
  -- Positive = inventory in (receipt/return/transfer_in/initial_balance);
  -- negative = inventory out (consumption/spoilage/waste/damage/transfer_out).
  -- Adjustments can be either sign.
  qty_delta        numeric(14,4) NOT NULL,

  -- Free-text reason for adjustments (required for manual_adjustment,
  -- spoilage, waste, damage, count_adjustment via app-layer check).
  reason           text,

  -- Reference to the upstream artifact that caused this transaction.
  -- reference_type + reference_id together identify e.g. the
  -- coffee_orders row or purchase_orders row.
  reference_type   text,
  reference_id     uuid,

  -- For transfers: the counter-party warehouse.
  counterparty_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,

  -- For reversals: the original transaction being reversed. Enables
  -- clean "was this cancelled?" queries.
  reverses_transaction_id   uuid REFERENCES public.inventory_transactions(id) ON DELETE RESTRICT,

  notes            text,
  created_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Aggregation-heavy queries: fast lookup of a SKU/warehouse's history.
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_sku_warehouse
  ON public.inventory_transactions (sku_id, warehouse_id, created_at DESC);
-- Timestamp-scoped rollups for weekly-usage math (Phase 4).
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_at
  ON public.inventory_transactions (created_at);
-- Reference lookup: "what did this coffee_order deduct?"
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference
  ON public.inventory_transactions (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
-- Reversal lookup.
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reversal
  ON public.inventory_transactions (reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL;

-- ── physical_counts ────────────────────────────────────────────────
-- Records the ACT of counting for audit even though the ledger effect
-- is a count_adjustment transaction. Lets us reconstruct "who counted
-- what to what, and how off were we".
CREATE TABLE IF NOT EXISTS public.physical_counts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id                    uuid NOT NULL REFERENCES public.inventory_skus(id) ON DELETE RESTRICT,
  warehouse_id              uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  counted_qty               numeric(14,4) NOT NULL,
  computed_on_hand_at_count numeric(14,4) NOT NULL,
  variance                  numeric(14,4) NOT NULL,
  adjustment_transaction_id uuid REFERENCES public.inventory_transactions(id) ON DELETE RESTRICT,
  counted_by                uuid REFERENCES public.profiles(id),
  counted_at                timestamptz NOT NULL DEFAULT now(),
  notes                     text
);

CREATE INDEX IF NOT EXISTS idx_physical_counts_sku_warehouse
  ON public.physical_counts (sku_id, warehouse_id, counted_at DESC);

-- ── RLS: service_role only for all inventory tables ─────────────────
-- Reads and writes are always through the admin API which uses
-- supabaseAdmin (service role). No RLS policies for authenticated
-- users; end-to-end auth is enforced at the API layer via
-- getAdminUserId. This mirrors how workflows/audit_logs are locked.
ALTER TABLE public.warehouses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_skus          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_counts         ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='warehouses' AND policyname='warehouses_service_role') THEN
    CREATE POLICY warehouses_service_role ON public.warehouses FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='suppliers' AND policyname='suppliers_service_role') THEN
    CREATE POLICY suppliers_service_role ON public.suppliers FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_skus' AND policyname='inventory_skus_service_role') THEN
    CREATE POLICY inventory_skus_service_role ON public.inventory_skus FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_configuration' AND policyname='inventory_configuration_service_role') THEN
    CREATE POLICY inventory_configuration_service_role ON public.inventory_configuration FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_transactions' AND policyname='inventory_transactions_service_role') THEN
    CREATE POLICY inventory_transactions_service_role ON public.inventory_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='physical_counts' AND policyname='physical_counts_service_role') THEN
    CREATE POLICY physical_counts_service_role ON public.physical_counts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── compute_on_hand() helper (PL/pgSQL) ─────────────────────────────
-- Returns the current on-hand for a SKU/warehouse by aggregating
-- inventory_transactions. This is the ONLY authoritative source of
-- on-hand. A follow-up phase can add a cached table if aggregation
-- proves expensive; the app layer will read through this function
-- either way.
CREATE OR REPLACE FUNCTION public.compute_on_hand(
  p_sku_id       uuid,
  p_warehouse_id uuid
) RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(qty_delta), 0)::numeric
  FROM public.inventory_transactions
  WHERE sku_id = p_sku_id
    AND warehouse_id = p_warehouse_id;
$$;

GRANT EXECUTE ON FUNCTION public.compute_on_hand(uuid, uuid) TO service_role;
