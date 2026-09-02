-- ==========================================================
-- Sales order ↔ sourced locations join table
--
-- When a location_services sales order lands as paid, the rep
-- sources placements against it. Each sourced location is either
-- linked to an existing sales_leads row (entity_type='location')
-- or entered manually. Locations flip 'sourced' → 'secured' as
-- they close, at which point the tier price (from locationPricing)
-- is stamped and the deposit paid on the order is credited
-- against the accumulated location fees.
--
-- Auto-invoice fires when secured count reaches the order's
-- locations_purchased quota (via the /invoice-remaining route);
-- reps can also invoice manually before the quota is met via
-- the same route.
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.sales_order_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,

  -- Optional link back to a sales_leads row when the location was
  -- attached from an existing lead. Null when the rep typed the
  -- location in manually. SET NULL on the lead being deleted so
  -- the sourced-location snapshot survives even if the lead row
  -- goes away.
  lead_id uuid REFERENCES public.sales_leads(id) ON DELETE SET NULL,

  -- Denormalized snapshot of the location. Copied from the linked
  -- lead at attach time, or provided directly for manual adds.
  -- Kept on the row so the order's placement history stays intact
  -- even if the source lead is edited or deleted.
  business_name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  city text,
  state text,
  zip text,
  machine_count integer DEFAULT 1,
  machine_type text,

  status text NOT NULL DEFAULT 'sourced'
    CHECK (status IN ('sourced', 'secured', 'declined', 'removed')),

  -- Pricing snapshot stamped at secure time — comes from
  -- src/lib/pricing/locationPricing.ts (TIER_PRICES or TEN_TEN_TEN_PRICE).
  -- tier is 1/2/3 (Basic/Premium/Elite); null before secured.
  tier smallint,
  tier_label text,
  secured_price numeric(12,2),
  deposit_credit_applied numeric(12,2) NOT NULL DEFAULT 0,

  attached_by uuid REFERENCES auth.users(id),
  attached_at timestamptz NOT NULL DEFAULT now(),
  secured_by uuid REFERENCES auth.users(id),
  secured_at timestamptz,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Don't attach the same lead to the same order twice.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_order_locations_order_lead
  ON public.sales_order_locations(order_id, lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_order_locations_order
  ON public.sales_order_locations(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_locations_lead
  ON public.sales_order_locations(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_locations_status
  ON public.sales_order_locations(order_id, status);

ALTER TABLE public.sales_order_locations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'service_role_sales_order_locations'
  ) THEN
    CREATE POLICY service_role_sales_order_locations
      ON public.sales_order_locations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
