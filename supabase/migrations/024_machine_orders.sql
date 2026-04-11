-- ==========================================================
-- Machine Orders + Financing Requests
-- ==========================================================
-- Captures customer orders from the /machines/[id] configurator.
-- A single machine_orders row is the canonical "deal" that admins
-- review. Financing details (if requested) live in a child table
-- so we can extend them later without migrating the parent.
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.machine_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who placed the order
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  company_name text,
  billing_address text,
  billing_city text,
  billing_state text,
  billing_zip text,

  -- What they're buying
  machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
  machine_name text NOT NULL,          -- snapshot at time of order
  machine_slug text,                   -- snapshot
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents integer NOT NULL,   -- snapshot of machine price at order time
  subtotal_cents integer NOT NULL,     -- quantity * unit_price

  -- Purchase type
  purchase_type text NOT NULL CHECK (purchase_type IN ('cash', 'finance')),
  financing_requested boolean NOT NULL DEFAULT false,
  estimated_monthly_cents integer,     -- populated when financing_requested = true

  -- Location services bundle
  location_services_selected boolean NOT NULL DEFAULT false,
  location_services_quote_min_cents integer,  -- e.g. 30000 ($300)
  location_services_quote_max_cents integer,  -- e.g. 120000 ($1,200)

  -- Bundle flag (derived)
  bundle_type text NOT NULL CHECK (bundle_type IN (
    'machine_only',
    'machine_plus_location',
    'machine_plus_finance',
    'full_package'
  )),

  -- Agreement snapshot
  agreement_version text,
  agreement_text text,
  accepted_terms boolean NOT NULL DEFAULT false,

  -- Sales rep attribution (optional referral)
  referring_rep_id uuid REFERENCES auth.users(id),
  referring_rep_name text,

  -- Workflow status
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review',     -- just submitted
    'under_review',       -- admin looking at it
    'approved',           -- approved, agreement sent
    'in_fulfillment',     -- payment / install in progress
    'completed',          -- delivered
    'cancelled'
  )),
  admin_notes text,

  -- Request metadata
  ip_address text,
  user_agent text,
  source text,            -- e.g. 'machines-configurator'

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machine_orders_status ON public.machine_orders(status);
CREATE INDEX IF NOT EXISTS idx_machine_orders_created ON public.machine_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_machine_orders_machine ON public.machine_orders(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_orders_email ON public.machine_orders(customer_email);

ALTER TABLE public.machine_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'machine_orders_service_role_all') THEN
    CREATE POLICY machine_orders_service_role_all ON public.machine_orders
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ==========================================================
-- Financing Requests
-- ==========================================================
-- Detailed financing side-car for orders that opted into financing.
-- Lives in its own table so downstream fields (credit app, decision,
-- contract, etc.) can grow without bloating machine_orders.
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.financing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.machine_orders(id) ON DELETE CASCADE,

  estimated_amount_cents integer NOT NULL,   -- principal being financed
  term_years integer NOT NULL DEFAULT 10,
  rate_range text DEFAULT '8–14% APR',
  estimated_monthly_cents integer NOT NULL,
  quantity integer NOT NULL,

  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_review',
    'approved',
    'declined',
    'withdrawn'
  )),
  decision_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financing_requests_order ON public.financing_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_financing_requests_status ON public.financing_requests(status);

ALTER TABLE public.financing_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'financing_requests_service_role_all') THEN
    CREATE POLICY financing_requests_service_role_all ON public.financing_requests
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ==========================================================
-- updated_at triggers
-- ==========================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS machine_orders_touch ON public.machine_orders;
CREATE TRIGGER machine_orders_touch
  BEFORE UPDATE ON public.machine_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS financing_requests_touch ON public.financing_requests;
CREATE TRIGGER financing_requests_touch
  BEFORE UPDATE ON public.financing_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS machines_touch ON public.machines;
CREATE TRIGGER machines_touch
  BEFORE UPDATE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
