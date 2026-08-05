-- Migration 139: Forecast engine — Phase 4
--
-- Two tables: replenishment_runs is the header for "the admin clicked
-- Calculate Recommendations at 2:47 PM on Aug 14"; replenishment_
-- recommendations is one row per SKU per run holding the full input
-- snapshot AND the formula outputs. Every recommendation is
-- reproducible by passing snapshot+formula_version back to the engine.
--
-- Recommendation lifecycle:
--   proposed        (engine wrote it)
--     ─▶ approved   (admin accepts the qty, ready for PO)
--     ─▶ ignored    (admin rejects this line for this cycle)
--     ─▶ superseded (a later run produced a newer proposal for this SKU)
--   approved
--     ─▶ ordered    (draft PO created, tagged back here)
--
-- Old proposed recommendations auto-flip to superseded when a new run
-- writes a fresh proposal for the same (sku_id, warehouse_id).

-- ── replenishment_runs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.replenishment_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id        uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  formula_version     integer NOT NULL,
  as_of_date          date NOT NULL,
  -- Full snapshot of the config values that governed this run so the
  -- entire run can be replayed identically even after config changes.
  input_snapshot      jsonb NOT NULL,
  -- Rollup for fast listing.
  lines_count         integer NOT NULL DEFAULT 0,
  proposed_count      integer NOT NULL DEFAULT 0,
  skipped_count       integer NOT NULL DEFAULT 0,
  notes               text,
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replenishment_runs_warehouse
  ON public.replenishment_runs (warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replenishment_runs_created_at
  ON public.replenishment_runs (created_at DESC);

-- ── replenishment_recommendations ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.replenishment_recommendations (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                      uuid NOT NULL REFERENCES public.replenishment_runs(id) ON DELETE CASCADE,
  sku_id                      uuid NOT NULL REFERENCES public.inventory_skus(id) ON DELETE RESTRICT,
  warehouse_id                uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  formula_version             integer NOT NULL,

  -- ── SNAPSHOT: everything the engine saw ────────────────────────────
  weekly_usage_snapshot       jsonb NOT NULL,
    -- e.g. [{"week_start":"2026-06-30","units_used":18,"stockout_flag":false,"excluded":false,"exclusion_reason":null}, ...]
  weeks_used_count            integer NOT NULL,
  weeks_excluded_count        integer NOT NULL DEFAULT 0,
  weeks_excluded_reasons      jsonb NOT NULL DEFAULT '{}'::jsonb,
  on_hand_at_run              numeric(14,4) NOT NULL,
  open_inbound_at_run         numeric(14,4) NOT NULL DEFAULT 0,
  supplier_id_used            uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  lead_time_days_used         integer NOT NULL,
  order_cycle_days_used       integer NOT NULL,
  safety_stock_pct_used       numeric(5,4) NOT NULL,
  lookback_weeks_used         integer NOT NULL,
  forecast_method_used        text NOT NULL CHECK (forecast_method_used IN ('simple','weighted')),
  weight_config_used          jsonb,
  pack_size_used              integer NOT NULL,
  spike_threshold_used        numeric(4,2) NOT NULL,

  -- ── COMPUTED: formula outputs ──────────────────────────────────────
  avg_weekly_usage            numeric(14,4) NOT NULL,
  coverage_weeks              numeric(6,3) NOT NULL,
  base_need                   numeric(14,4) NOT NULL,
  safety_stock_qty            numeric(14,4) NOT NULL,
  target_stock_qty            numeric(14,4) NOT NULL,
  net_need                    numeric(14,4) NOT NULL,
  recommended_qty             numeric(14,4) NOT NULL CHECK (recommended_qty >= 0),

  -- ── STATE ─────────────────────────────────────────────────────────
  confidence                  text NOT NULL CHECK (confidence IN ('low','medium','high')),
  flags                       text[] NOT NULL DEFAULT '{}',
  status                      text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','approved','ordered','ignored','superseded')),

  -- Admin actions
  final_order_qty             numeric(14,4),
  override_reason             text,
  reviewed_by                 uuid REFERENCES public.profiles(id),
  reviewed_at                 timestamptz,

  -- Linkage
  ordered_purchase_order_id           uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  superseded_by_recommendation_id     uuid REFERENCES public.replenishment_recommendations(id) ON DELETE SET NULL,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (run_id, sku_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendations_run
  ON public.replenishment_recommendations (run_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status_warehouse
  ON public.replenishment_recommendations (status, warehouse_id);
-- Fast lookup of the current proposed rec for a SKU (used by supersede).
CREATE INDEX IF NOT EXISTS idx_recommendations_sku_proposed
  ON public.replenishment_recommendations (sku_id, warehouse_id)
  WHERE status = 'proposed';

-- ── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.replenishment_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replenishment_recommendations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='replenishment_runs' AND policyname='replenishment_runs_service_role') THEN
    CREATE POLICY replenishment_runs_service_role ON public.replenishment_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='replenishment_recommendations' AND policyname='replenishment_recommendations_service_role') THEN
    CREATE POLICY replenishment_recommendations_service_role ON public.replenishment_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
