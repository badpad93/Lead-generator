-- Storefront tenants — foundation.
--
-- This migration lays the DB foundation for the multi-tenant coffee
-- commerce program. Three tables ship together because every later
-- migration in the storefront series depends on all three:
--
--   1. storefront_tenants          — 1:1 with profiles.id; any
--      existing operator account can "activate" as a storefront
--      tenant by getting a row here. We do NOT rename the current
--      `operator` role — the tenancy is an extension of a profile,
--      not a new account type.
--
--   2. storefront_audit_events     — immutable actor/action/entity
--      audit trail for every tenant-scoped write that matters
--      (tenant approve/suspend, customer transfer, price change,
--      commission adjustment, admin impersonation, etc.). Structured
--      before/after JSON so the admin console can replay history.
--
--   3. platform_feature_flags      — internal on/off toggles keyed
--      by string so the storefront rollout can be gated per
--      environment without a code deploy.
--
-- Money is stored as NUMERIC(12,2) (dollars-and-cents) to match the
-- existing sales_orders convention. No integer minor-unit anywhere
-- in the storefront schema.
--
-- Idempotent — every CREATE uses IF NOT EXISTS, RLS policies are
-- dropped-then-recreated.

-- ─── 1. storefront_tenants ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.storefront_tenants (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner profile — this is the operator account that gets the
  -- branded storefront. 1:1 (a profile can only host one tenant).
  owner_profile_id       uuid NOT NULL UNIQUE
                          REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- Identity + routing
  slug                   text NOT NULL UNIQUE
                          CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$'),
  subdomain              text UNIQUE
                          CHECK (subdomain IS NULL OR subdomain ~ '^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$'),
  legal_name             text NOT NULL,
  display_name           text NOT NULL,

  -- Status lifecycle: pending → approved → suspended|closed
  status                 text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','suspended','closed')),
  approved_at            timestamptz,
  approved_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  suspended_at           timestamptz,
  suspended_reason       text,

  -- Contact
  primary_contact_name   text,
  primary_contact_email  text,
  primary_contact_phone  text,
  support_email          text,

  -- Branding (structured JSON only — no arbitrary CSS/JS ever)
  brand                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Expected shape (validated at API layer):
  --   { logo_url, favicon_url, primary_color, accent_color,
  --     text_color, hero_headline, hero_subheadline, footer_note }

  -- Public page settings
  public_page            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { enrollment_cta_label, show_contact, catalog_intro,
  --   allow_guest_browse (bool) }

  -- Pricing tier assignment — inherits from coffee_pricing_tiers.
  -- A tenant's "base price" for a product is whatever their tier
  -- sets in coffee_product_tier_prices; customer price they set on
  -- top must stay >= that base. Nullable = tier not yet assigned.
  base_pricing_tier_id   uuid REFERENCES public.coffee_pricing_tiers(id) ON DELETE SET NULL,

  -- QuickBooks accounting refs
  qb_vendor_ref          text,
  qb_customer_ref        text,

  -- Tax + W-9 onboarding gates for payouts
  tax_status             text NOT NULL DEFAULT 'not_started'
                          CHECK (tax_status IN ('not_started','submitted','approved','rejected')),
  w9_submitted_at        timestamptz,
  w9_approved_at         timestamptz,

  -- Payout account (Dwolla / ACH refs live elsewhere; this is just
  -- the operator's chosen destination signal)
  payout_method          text
                          CHECK (payout_method IS NULL OR payout_method IN ('qb_bill','ach','check')),

  metadata               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storefront_tenants_status
  ON public.storefront_tenants(status);
CREATE INDEX IF NOT EXISTS idx_storefront_tenants_slug
  ON public.storefront_tenants(slug);

-- updated_at trigger — reuse the touch pattern from other tables.
CREATE OR REPLACE FUNCTION public.storefront_tenants_touch_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_storefront_tenants_touch ON public.storefront_tenants;
CREATE TRIGGER trg_storefront_tenants_touch
  BEFORE UPDATE ON public.storefront_tenants
  FOR EACH ROW EXECUTE FUNCTION public.storefront_tenants_touch_updated_at();

ALTER TABLE public.storefront_tenants ENABLE ROW LEVEL SECURITY;

-- Public read of the branding surface for approved tenants — needed
-- so the anonymous /coffee/o/{slug} page can render brand + hero
-- copy without an authenticated session. The service-role admin
-- client bypasses RLS for writes.
DROP POLICY IF EXISTS "Public reads approved tenants" ON public.storefront_tenants;
CREATE POLICY "Public reads approved tenants"
  ON public.storefront_tenants FOR SELECT
  USING (status = 'approved');

-- Owners see their own tenant row (even before approval).
DROP POLICY IF EXISTS "Owner reads own tenant" ON public.storefront_tenants;
CREATE POLICY "Owner reads own tenant"
  ON public.storefront_tenants FOR SELECT TO authenticated
  USING (owner_profile_id = auth.uid());

-- Admins see everything.
DROP POLICY IF EXISTS "Admins manage tenants" ON public.storefront_tenants;
CREATE POLICY "Admins manage tenants"
  ON public.storefront_tenants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ─── 2. storefront_audit_events ───────────────────────────────────
-- Structured, append-only audit log. Every entry captures actor,
-- action verb, target entity, and before/after JSON snapshots so
-- the admin console can render "who changed what, when, why."
CREATE TABLE IF NOT EXISTS public.storefront_audit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES public.storefront_tenants(id) ON DELETE SET NULL,
  actor_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role     text,
  action         text NOT NULL,
  -- Common action verbs (informational — not enforced):
  --   tenant.created / tenant.approved / tenant.suspended
  --   tenant.branding_updated / tenant.tier_assigned
  --   customer.enrolled / customer.transferred / customer.suspended
  --   pricing.tenant_updated / pricing.customer_updated
  --   commission.adjusted / commission.reversed
  --   payout.held / payout.released / payout.failed
  --   admin.impersonated / admin.override
  entity_type    text NOT NULL,
  entity_id      uuid,
  before         jsonb,
  after          jsonb,
  reason         text,
  correlation_id text,
  ip_address     inet,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storefront_audit_tenant
  ON public.storefront_audit_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_audit_actor
  ON public.storefront_audit_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_audit_entity
  ON public.storefront_audit_events(entity_type, entity_id);

ALTER TABLE public.storefront_audit_events ENABLE ROW LEVEL SECURITY;

-- Audit is admin-only readable. Tenant owners can read their own
-- tenant-scoped entries so operators see their own history.
DROP POLICY IF EXISTS "Admins read all audit" ON public.storefront_audit_events;
CREATE POLICY "Admins read all audit"
  ON public.storefront_audit_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "Tenant owner reads own audit" ON public.storefront_audit_events;
CREATE POLICY "Tenant owner reads own audit"
  ON public.storefront_audit_events FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM storefront_tenants t
      WHERE t.id = tenant_id AND t.owner_profile_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through service role
-- from the API layer only. This keeps the audit log immutable from
-- the client.

-- ─── 3. platform_feature_flags ───────────────────────────────────
-- Small internal flag mechanism. Env vars still work as kill
-- switches; this table is for DB-backed toggles the admin console
-- can flip without a redeploy.
CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
  key          text PRIMARY KEY,
  enabled      boolean NOT NULL DEFAULT false,
  description  text,
  updated_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated reads flags" ON public.platform_feature_flags;
CREATE POLICY "Authenticated reads flags"
  ON public.platform_feature_flags FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage flags" ON public.platform_feature_flags;
CREATE POLICY "Admins manage flags"
  ON public.platform_feature_flags FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Seed the storefront master flag off by default so the code paths
-- can be safely deployed before admin flips it on.
INSERT INTO public.platform_feature_flags (key, enabled, description)
VALUES
  ('storefront.public_pages_enabled', false,
   'Enable public branded coffee storefront pages at /coffee/o/{slug}. Off = 404 for unknown routes; unaffected for logged-in admins.'),
  ('storefront.enrollment_enabled', false,
   'Allow customers to enroll through a tenant invitation link. Off = enrollment endpoints reject.'),
  ('storefront.commission_settlement_gating', true,
   'Only mark storefront commission as payable AFTER payment settlement (QB webhook). Off = commission is payable immediately (dev-only shortcut).')
ON CONFLICT (key) DO NOTHING;
