-- ═════════════════════════════════════════════════════════════════════
-- 149 — Manufacturer / Wholesaler marketplace partners (foundation)
-- ─────────────────────────────────────────────────────────────────────
-- New account type for equipment manufacturers, wholesalers, and
-- distributors who onboard to sell vending equipment directly through
-- Vending Connector while retaining inventory, shipping, fulfillment,
-- warranty, and product support.
--
-- Distinct from the existing internal `suppliers` table (137) which
-- models purchase-order counterparties; these are marketplace-facing
-- selling entities with their own auth identity + agreement + payout
-- rails.
--
-- Naming: `manufacturer_partners` (not `suppliers`) to avoid collision
-- with 137's inventory concept.
--
-- Foundation only. Enrollment wizard, agreement flow, equipment
-- extensions, payout release, and admin approval area ship in
-- follow-up commits. This migration installs:
--   * profiles.role enum expansion (adds 'manufacturer_partner')
--   * manufacturer_partners table (1:1 with profiles.id, self-managed)
--   * manufacturer_agreements table (versioned executed agreements)
--   * machine_listings.manufacturer_partner_id (nullable — legacy
--     user-posted listings keep working, `NULL` means legacy)
--   * machine_listings.wholesale_price_cents (nullable — only set
--     for manufacturer-sourced items)
--   * machine_listing_purchases commercial snapshot columns
--   * Private bucket manufacturer-partner-docs (logo, spec, brochure,
--     warranty, executed agreement) — service-role-only reads
--   * RLS + service-role policies
-- ═════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. profiles.role enum: add 'manufacturer_partner'
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'operator', 'locator', 'location_manager', 'requestor',
    'admin', 'sales', 'sales_manager', 'director_of_sales', 'market_leader',
    'placement_partner', 'manufacturer_partner'
  ));

-- ─────────────────────────────────────────────────────────────
-- 2. manufacturer_partners — 1:1 with profiles.id
-- ─────────────────────────────────────────────────────────────
-- The authenticated user managing the manufacturer account owns
-- profiles.id; the manufacturer_partners row shares that PK so RLS
-- + joins are one hop. Additional team members ship in a follow-up
-- (manufacturer_team_members).
CREATE TABLE IF NOT EXISTS public.manufacturer_partners (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Company info (Step 1)
  legal_company_name  text NOT NULL,
  dba_or_brand        text,
  entity_type         text NOT NULL DEFAULT 'manufacturer'
    CHECK (entity_type IN ('manufacturer', 'wholesaler', 'distributor')),
  website             text,
  ein_tax_id          text,
  year_established    int,
  company_description text,
  logo_storage_path   text,

  -- Primary contact
  primary_contact_name  text,
  primary_contact_title text,
  primary_contact_email text,
  primary_contact_phone text,

  -- Business address
  business_address text,
  business_city    text,
  business_state   text,
  business_zip     text,
  business_country text NOT NULL DEFAULT 'US',

  -- Fulfillment (Step 2) — all denormalized per brief. Additional
  -- warehouses live in a JSONB array so we don't need a separate
  -- table for what's typically 0-2 rows per partner.
  shipping_origin_address text,
  shipping_origin_city    text,
  shipping_origin_state   text,
  shipping_origin_zip     text,
  additional_warehouses   jsonb NOT NULL DEFAULT '[]'::jsonb,

  order_acknowledgment_time_hours int,
  shipment_lead_time_days         int,
  freight_process                 text,
  liftgate_available              boolean NOT NULL DEFAULT false,
  inside_delivery_available       boolean NOT NULL DEFAULT false,
  installation_available          boolean NOT NULL DEFAULT false,
  return_policy                   text,
  warranty_summary                text,
  warranty_doc_storage_path       text,

  technical_contact_name  text,
  technical_contact_email text,
  technical_contact_phone text,
  escalation_contact_name  text,
  escalation_contact_email text,
  escalation_contact_phone text,

  inventory_update_method text NOT NULL DEFAULT 'manual'
    CHECK (inventory_update_method IN ('manual', 'csv', 'api', 'other')),
  inventory_update_notes  text,

  -- Wizard progress (autosave) — supplies enrollment step + arbitrary
  -- transient state without needing a separate onboarding table.
  current_step int NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 6),
  step_data    jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Payment / payout — Dwolla funding source URL only. Raw routing +
  -- account numbers never touch this database.
  dwolla_customer_id        text,
  dwolla_funding_source_url text,
  dwolla_verified_at        timestamptz,
  payout_status text NOT NULL DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'submitted', 'verified', 'restricted', 'complete')),

  -- Admin lifecycle. Draft = wizard in-flight; submitted = wizard
  -- finished; pending_review = admin picks up; changes_requested =
  -- kicked back with a reason; approved = ready to activate;
  -- active = publishing enabled; suspended = temporarily paused
  -- (reason recorded); rejected = never accepted; terminated = ended.
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'submitted', 'pending_review', 'changes_requested',
      'approved', 'active', 'suspended', 'rejected', 'terminated'
    )),
  status_reason        text,
  reviewed_by          uuid REFERENCES public.profiles(id),
  reviewed_at          timestamptz,
  suspended_at         timestamptz,
  suspended_by         uuid REFERENCES public.profiles(id),
  terminated_at        timestamptz,
  terminated_by        uuid REFERENCES public.profiles(id),
  admin_notes          text,

  -- Convenience — the version of the agreement CURRENTLY in force
  -- for this partner. Full history lives in manufacturer_agreements.
  current_agreement_version text,

  submitted_at timestamptz,
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manufacturer_partners_status
  ON public.manufacturer_partners(status);
CREATE INDEX IF NOT EXISTS idx_manufacturer_partners_entity_type
  ON public.manufacturer_partners(entity_type);

-- ─────────────────────────────────────────────────────────────
-- 3. manufacturer_agreements — versioned executed agreements
-- ─────────────────────────────────────────────────────────────
-- One row per accepted version. Existing suppliers keep the exact
-- version they signed. Materially revised agreements set
-- superseded_at on the old row and insert a new row when the
-- supplier re-accepts.
CREATE TABLE IF NOT EXISTS public.manufacturer_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_partner_id uuid NOT NULL REFERENCES public.manufacturer_partners(id) ON DELETE CASCADE,

  agreement_version text NOT NULL,
  effective_date    date NOT NULL,

  signer_printed_name text NOT NULL,
  signer_title        text NOT NULL,
  signature_type      text NOT NULL CHECK (signature_type IN ('typed', 'drawn')),
  signature_data      text,      -- base64 PNG when drawn
  ip_address          inet,
  user_agent          text,
  accepted_at         timestamptz NOT NULL DEFAULT now(),

  -- Executed PDF lives in the private bucket
  executed_pdf_storage_path text,

  -- Commercial variables baked in at signing so the agreement is
  -- self-describing without cross-referencing a mutable manufacturer
  -- record.
  vc_operating_entity   text,
  vc_address            text,
  manufacturer_legal_name text,
  manufacturer_address    text,
  shipping_charges_method text,
  returns_cancellation_terms text,
  liability_cap_modification text,
  exclusivity_terms          text,
  integration_notes          text,
  order_acknowledgment_target text,
  shipment_target             text,

  -- Set when a materially revised version supersedes this one
  superseded_at timestamptz,
  superseded_by uuid REFERENCES public.manufacturer_agreements(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manufacturer_partner_id, agreement_version)
);

CREATE INDEX IF NOT EXISTS idx_manufacturer_agreements_partner
  ON public.manufacturer_agreements(manufacturer_partner_id);
CREATE INDEX IF NOT EXISTS idx_manufacturer_agreements_active
  ON public.manufacturer_agreements(manufacturer_partner_id)
  WHERE superseded_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. machine_listings — seller + wholesale price
-- ─────────────────────────────────────────────────────────────
-- NULL manufacturer_partner_id = legacy user-posted listing.
-- Non-null = manufacturer marketplace item. Wholesale price is
-- ONLY meaningful for manufacturer listings and MUST NEVER leak
-- through the public /api/machine-listings endpoint (allowlist
-- sanitizer inversion ships in the next commit before any
-- wholesale price rows exist).
ALTER TABLE public.machine_listings
  ADD COLUMN IF NOT EXISTS manufacturer_partner_id uuid REFERENCES public.manufacturer_partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wholesale_price_cents   integer
    CHECK (wholesale_price_cents IS NULL OR wholesale_price_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_machine_listings_manufacturer_partner
  ON public.machine_listings(manufacturer_partner_id);

-- ─────────────────────────────────────────────────────────────
-- 5. machine_listing_purchases — commercial snapshot at buy time
-- ─────────────────────────────────────────────────────────────
-- Snapshotted at checkout so later price changes on the listing
-- don't rewrite historical order economics. Nullable throughout
-- because legacy purchases have no manufacturer-partner context.
ALTER TABLE public.machine_listing_purchases
  ADD COLUMN IF NOT EXISTS manufacturer_partner_id           uuid REFERENCES public.manufacturer_partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wholesale_price_cents_at_purchase integer,
  ADD COLUMN IF NOT EXISTS manufacturer_proceeds_cents       integer,
  ADD COLUMN IF NOT EXISTS vc_margin_cents                   integer,
  ADD COLUMN IF NOT EXISTS shipping_cents_at_purchase        integer,
  ADD COLUMN IF NOT EXISTS tax_cents_at_purchase             integer,
  ADD COLUMN IF NOT EXISTS financing_proceeds_cents          integer,
  ADD COLUMN IF NOT EXISTS commercial_snapshotted_at         timestamptz;

CREATE INDEX IF NOT EXISTS idx_machine_listing_purchases_manufacturer_partner
  ON public.machine_listing_purchases(manufacturer_partner_id);

-- ─────────────────────────────────────────────────────────────
-- 6. Private storage bucket for manufacturer documents
-- ─────────────────────────────────────────────────────────────
-- Company logo, spec sheets, brochures, warranty docs, executed
-- agreement PDFs. Service-role reads/writes only; supplier + admin
-- downloads use short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('manufacturer-partner-docs', 'manufacturer-partner-docs', false)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 7. RLS
-- ─────────────────────────────────────────────────────────────
-- Both tables service-role only. All writes/reads flow through
-- /api routes that enforce (a) admin (getAdminUserId/getSalesUser)
-- for cross-tenant surfaces, or (b) supplier-scoped identity checks
-- (auth.uid() == manufacturer_partners.id) for self-service.
ALTER TABLE public.manufacturer_partners  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_agreements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'manufacturer_partners'
                   AND policyname = 'service_role_manufacturer_partners') THEN
    CREATE POLICY service_role_manufacturer_partners
      ON public.manufacturer_partners FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'manufacturer_agreements'
                   AND policyname = 'service_role_manufacturer_agreements') THEN
    CREATE POLICY service_role_manufacturer_agreements
      ON public.manufacturer_agreements FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Self-read on manufacturer_partners so a signed-in manufacturer can
-- hydrate its own dashboard without a server round-trip. Writes
-- still flow through service-role APIs.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'manufacturer_partners'
                   AND policyname = 'self_read_manufacturer_partner') THEN
    CREATE POLICY self_read_manufacturer_partner
      ON public.manufacturer_partners FOR SELECT TO authenticated
      USING (id = auth.uid());
  END IF;
END $$;

COMMENT ON COLUMN public.machine_listings.wholesale_price_cents IS
  'Manufacturer sale price to VC. NEVER expose in public API responses — allowlist sanitizer in /api/machine-listings must exclude this column.';
COMMENT ON COLUMN public.machine_listing_purchases.wholesale_price_cents_at_purchase IS
  'Snapshot of the wholesale price at purchase time. Preserves the commercial split against future price changes.';
