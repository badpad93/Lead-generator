-- Migration 138: Purchase orders — Phase 3
--
-- Standalone. Nothing about this reuses sales_orders. Rationale:
-- PO lifecycle events (send, receive, cancel, close), audit needs
-- (supplier confirmations, per-receipt records), and counterparty
-- semantics are all different from sales orders. Overloading would
-- have entangled the code for both forever.
--
-- Every PO receipt writes a `receipt` inventory_transactions row
-- (Phase 1 ledger) via purchase_order_receipts as the audit bridge.

-- ── po_number sequence ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.purchase_order_number_seq
  START WITH 1000
  INCREMENT BY 1
  MINVALUE 1000
  NO MAXVALUE
  CACHE 1;

-- ── purchase_orders ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number                text UNIQUE NOT NULL
    DEFAULT ('PO-' || LPAD(nextval('public.purchase_order_number_seq')::text, 6, '0')),
  supplier_id              uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id             uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status                   text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'partially_received', 'received', 'cancelled', 'closed')),

  -- Where the recommendation came from, if any. Nullable — admins can
  -- create POs manually without going through the forecast run.
  replenishment_run_id     uuid,

  -- Financials — all optional; POs can be tracked without dollar
  -- amounts if the org is only using this for inventory movement.
  subtotal_cents           integer,
  shipping_cents           integer,
  tax_cents                integer,
  total_cents              integer,

  expected_delivery_date   date,
  supplier_reference       text,
  notes                    text,

  -- Lifecycle timestamps
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES public.profiles(id),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  sent_at                  timestamptz,
  sent_by                  uuid REFERENCES public.profiles(id),
  cancelled_at             timestamptz,
  cancelled_by             uuid REFERENCES public.profiles(id),
  cancellation_reason      text,
  closed_at                timestamptz,
  closed_by                uuid REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
  ON public.purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier
  ON public.purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_warehouse
  ON public.purchase_orders (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at
  ON public.purchase_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_open
  ON public.purchase_orders (status, expected_delivery_date)
  WHERE status IN ('sent', 'partially_received');

-- ── purchase_order_lines ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  sku_id              uuid NOT NULL REFERENCES public.inventory_skus(id) ON DELETE RESTRICT,
  line_number         integer NOT NULL DEFAULT 1,
  ordered_qty         numeric(14,4) NOT NULL CHECK (ordered_qty > 0),
  -- Cached rollup of purchase_order_receipts.received_qty for fast
  -- listing queries. Kept in sync by the service layer on every
  -- receipt insert; never authoritative — purchase_order_receipts is.
  received_qty        numeric(14,4) NOT NULL DEFAULT 0
    CHECK (received_qty >= 0),
  unit_cost_cents     integer,
  line_total_cents    integer,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, sku_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po
  ON public.purchase_order_lines (purchase_order_id, line_number);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_sku
  ON public.purchase_order_lines (sku_id);
-- Fast "open inbound" lookup for the forecast engine (Phase 4).
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_open_inbound
  ON public.purchase_order_lines (sku_id, purchase_order_id)
  WHERE received_qty < ordered_qty;

-- ── purchase_order_receipts ─────────────────────────────────────────
-- Every partial receipt is a row. The linked inventory_transaction_id
-- points at the ledger row that actually moved stock.
CREATE TABLE IF NOT EXISTS public.purchase_order_receipts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id        uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  purchase_order_line_id   uuid NOT NULL REFERENCES public.purchase_order_lines(id) ON DELETE RESTRICT,
  warehouse_id             uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  received_qty             numeric(14,4) NOT NULL CHECK (received_qty > 0),
  inventory_transaction_id uuid REFERENCES public.inventory_transactions(id) ON DELETE RESTRICT,
  received_by              uuid REFERENCES public.profiles(id),
  received_at              timestamptz NOT NULL DEFAULT now(),
  notes                    text
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_receipts_po
  ON public.purchase_order_receipts (purchase_order_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_order_receipts_line
  ON public.purchase_order_receipts (purchase_order_line_id);

-- ── RLS: service_role only, matches Phase 1 pattern ─────────────────
ALTER TABLE public.purchase_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_receipts  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='purchase_orders' AND policyname='purchase_orders_service_role') THEN
    CREATE POLICY purchase_orders_service_role ON public.purchase_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='purchase_order_lines' AND policyname='purchase_order_lines_service_role') THEN
    CREATE POLICY purchase_order_lines_service_role ON public.purchase_order_lines FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='purchase_order_receipts' AND policyname='purchase_order_receipts_service_role') THEN
    CREATE POLICY purchase_order_receipts_service_role ON public.purchase_order_receipts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── open_inbound_qty(sku_id, warehouse_id) helper ───────────────────
-- Sum of (ordered_qty - received_qty) across all non-terminal POs at
-- a warehouse. This is what the forecast engine (Phase 4) subtracts
-- from Net Need to avoid over-ordering when a PO is already inbound.
CREATE OR REPLACE FUNCTION public.open_inbound_qty(
  p_sku_id       uuid,
  p_warehouse_id uuid
) RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(pol.ordered_qty - pol.received_qty), 0)::numeric
  FROM public.purchase_order_lines pol
  JOIN public.purchase_orders po ON po.id = pol.purchase_order_id
  WHERE pol.sku_id = p_sku_id
    AND po.warehouse_id = p_warehouse_id
    AND po.status IN ('sent', 'partially_received')
    AND pol.received_qty < pol.ordered_qty;
$$;

GRANT EXECUTE ON FUNCTION public.open_inbound_qty(uuid, uuid) TO service_role;
