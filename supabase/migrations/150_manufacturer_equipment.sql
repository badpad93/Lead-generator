-- ═════════════════════════════════════════════════════════════════════
-- 150 — Manufacturer equipment listings extensions + pricing exceptions
-- ─────────────────────────────────────────────────────────────────────
-- Extends machine_listings with the manufacturer-specific columns the
-- brief requires (SKU, spec/brochure/video URLs, dimensions, weight,
-- electrical, temperature zone, compat, certifications, MSRP, per-
-- listing warranty + lead time + shipping cost). All nullable so
-- legacy user-posted rows are unaffected.
--
-- Adds machine_listing_pricing_exceptions table for admin-approved
-- margin > $300 requests. The enforcement lives in the app layer
-- (server-side check on manufacturer PATCH), but the exception
-- record is durable + auditable here.
--
-- Extends the status CHECK to include the manufacturer-flow states
-- (draft, pending_review, approved, changes_requested, inactive)
-- while keeping the legacy user-posted flow (pending, active, sold,
-- rejected) intact.
-- ═════════════════════════════════════════════════════════════════════

-- ─── New product columns on machine_listings ────────────────────────
ALTER TABLE public.machine_listings
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS msrp_cents integer
    CHECK (msrp_cents IS NULL OR msrp_cents >= 0),
  ADD COLUMN IF NOT EXISTS lead_time_days integer
    CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  ADD COLUMN IF NOT EXISTS manufacturer_shipping_notes text,
  ADD COLUMN IF NOT EXISTS listing_warranty_summary text,
  ADD COLUMN IF NOT EXISTS spec_sheet_url text,
  ADD COLUMN IF NOT EXISTS brochure_url text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS dimensions_text text,
  ADD COLUMN IF NOT EXISTS weight_lbs numeric(10, 2)
    CHECK (weight_lbs IS NULL OR weight_lbs >= 0),
  ADD COLUMN IF NOT EXISTS electrical_requirements text,
  ADD COLUMN IF NOT EXISTS temperature_zone text
    CHECK (temperature_zone IS NULL OR temperature_zone IN ('ambient', 'refrigerated', 'frozen', 'combo')),
  ADD COLUMN IF NOT EXISTS payment_system_compatibility text,
  ADD COLUMN IF NOT EXISTS software_compatibility text,
  ADD COLUMN IF NOT EXISTS certifications text;

CREATE INDEX IF NOT EXISTS idx_machine_listings_sku
  ON public.machine_listings(sku)
  WHERE sku IS NOT NULL;

-- ─── Status enum expansion ──────────────────────────────────────────
-- Legacy user-posted values (pending, active, sold, rejected) stay
-- valid; adds manufacturer-flow lifecycle values.
ALTER TABLE public.machine_listings
  DROP CONSTRAINT IF EXISTS machine_listings_status_check;

ALTER TABLE public.machine_listings
  ADD CONSTRAINT machine_listings_status_check
  CHECK (status IN (
    -- Legacy user-posted flow
    'pending', 'active', 'sold', 'rejected',
    -- Manufacturer-flow additions
    'draft', 'pending_review', 'approved', 'changes_requested', 'inactive'
  ));

COMMENT ON COLUMN public.machine_listings.status IS
  'Lifecycle. Legacy user-posted flow uses pending/active/sold/rejected. Manufacturer flow uses draft → pending_review → approved (publishes) → active. changes_requested and inactive are terminal-but-recoverable states admin can flip to.';

-- ─── Pricing exceptions ─────────────────────────────────────────────
-- Every time a manufacturer wants margin > $300 on a listing they
-- create a request row here. Admin approves/rejects; app layer
-- enforces "listing may only carry margin > $300 if there's an
-- approved exception whose approved_max_margin_cents covers it".
CREATE TABLE IF NOT EXISTS public.machine_listing_pricing_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_listing_id uuid NOT NULL REFERENCES public.machine_listings(id) ON DELETE CASCADE,
  manufacturer_partner_id uuid NOT NULL REFERENCES public.manufacturer_partners(id) ON DELETE CASCADE,

  requested_margin_cents integer NOT NULL CHECK (requested_margin_cents > 0),
  requested_final_price_cents integer NOT NULL CHECK (requested_final_price_cents > 0),
  requested_wholesale_price_cents integer NOT NULL CHECK (requested_wholesale_price_cents >= 0),
  request_reason text,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  approved_max_margin_cents integer
    CHECK (approved_max_margin_cents IS NULL OR approved_max_margin_cents >= 0),

  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_note text,

  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_exceptions_listing
  ON public.machine_listing_pricing_exceptions(machine_listing_id);
CREATE INDEX IF NOT EXISTS idx_pricing_exceptions_status
  ON public.machine_listing_pricing_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_pricing_exceptions_partner
  ON public.machine_listing_pricing_exceptions(manufacturer_partner_id);

ALTER TABLE public.machine_listing_pricing_exceptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'machine_listing_pricing_exceptions'
                   AND policyname = 'service_role_pricing_exceptions') THEN
    CREATE POLICY service_role_pricing_exceptions
      ON public.machine_listing_pricing_exceptions FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.machine_listing_pricing_exceptions IS
  'Admin-approved margin > $300 requests. App layer enforces that a listing may only publish with margin > $300 when there is an approved row here whose approved_max_margin_cents covers the current listing margin.';
