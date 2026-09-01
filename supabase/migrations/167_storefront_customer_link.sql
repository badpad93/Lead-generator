-- Storefront customer↔tenant linkage + invitation tokens.
--
-- A customer's assignment to a tenant is PERMANENT (per spec §
-- "Commercial Rules": "Customers cannot change operators. Only an
-- authorized Apex administrator may transfer a customer, using an
-- audited administrative process.")
--
-- We enforce that at three layers:
--   1. FK column on profiles + a partial UNIQUE index so a single
--      profile row can point to exactly one tenant.
--   2. Application layer: the enrollment endpoint refuses to stamp
--      a profile that already has a tenant_id set. Transfers go
--      through the admin-only /api/admin/storefronts/customers/
--      transfer route, which writes storefront_audit_events.
--   3. RLS: only service role can UPDATE profiles.storefront_tenant_id;
--      Supabase Auth users cannot change their own tenant via any
--      direct table write.
--
-- Invitations are opaque, signed tokens with expiration + one-shot
-- consumption. The token is what carries the tenant_id at signup —
-- the browser cannot claim membership by URL parameter alone.

-- ─── 1. profiles.storefront_tenant_id — permanent membership FK ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS storefront_tenant_id uuid
    REFERENCES public.storefront_tenants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS storefront_enrolled_at timestamptz,
  ADD COLUMN IF NOT EXISTS storefront_enrollment_source text
    CHECK (storefront_enrollment_source IS NULL OR
           storefront_enrollment_source IN ('invitation','direct_link','admin_manual','admin_transfer','migration'));

COMMENT ON COLUMN public.profiles.storefront_tenant_id IS
  'Permanent link to the coffee storefront tenant this customer buys through. Once set, only Apex admin may change (audited via storefront_audit_events).';

CREATE INDEX IF NOT EXISTS idx_profiles_storefront_tenant
  ON public.profiles(storefront_tenant_id)
  WHERE storefront_tenant_id IS NOT NULL;

-- Belt-and-suspenders: a profile can only ever hold one tenant.
-- (Column is already scalar so this is defense in depth.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_storefront_tenant_singleton
  ON public.profiles(id)
  WHERE storefront_tenant_id IS NOT NULL;

-- ─── 2. storefront_invitations ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.storefront_invitations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.storefront_tenants(id) ON DELETE CASCADE,
  invited_by        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- Opaque, high-entropy token (generated server-side; never
  -- guessable). Stored as-is; SHA-256 hashing not used here
  -- because the token IS the credential — anyone with the URL
  -- gets to enroll. Matches the existing pattern in
  -- agreement_tokens / coffee guest-track tokens.
  token             text NOT NULL UNIQUE,

  -- Optional pre-fill / delivery
  email             text,
  display_name      text,

  -- The role the invitee will be created with when they enroll.
  -- location_manager is the default for "a location buying coffee
  -- through this tenant"; any additional roles reserved for future
  -- expansion.
  target_role       text NOT NULL DEFAULT 'location_manager'
                     CHECK (target_role IN ('location_manager','requestor','operator')),

  -- Optional per-customer pricing signal — if the tenant is
  -- pre-quoting a specific customer at a specific per-product
  -- price at invitation time, that intent lands here and is
  -- copied onto storefront_customer_prices at enrollment. NULL =
  -- customer inherits the tenant's default pricing.
  quoted_prices     jsonb,

  -- Lifecycle
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at        timestamptz,
  revoked_reason    text,
  accepted_at       timestamptz,
  accepted_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Attribution capture
  campaign          text,
  source            text,

  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storefront_invitations_tenant
  ON public.storefront_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_storefront_invitations_active
  ON public.storefront_invitations(tenant_id, expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.storefront_invitations ENABLE ROW LEVEL SECURITY;

-- The tenant owner sees their tenant's invitations.
DROP POLICY IF EXISTS "Owner reads own tenant invitations" ON public.storefront_invitations;
CREATE POLICY "Owner reads own tenant invitations"
  ON public.storefront_invitations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM storefront_tenants t
    WHERE t.id = tenant_id AND t.owner_profile_id = auth.uid()
  ));

-- Admins see everything.
DROP POLICY IF EXISTS "Admins manage invitations" ON public.storefront_invitations;
CREATE POLICY "Admins manage invitations"
  ON public.storefront_invitations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- The public token-consume endpoint reads through service role;
-- no anonymous select policy needed. This is intentional so token
-- enumeration via anon key is impossible.

-- ─── 3. Guard: prevent client-side tenant_id changes ─────────────
-- Function + trigger that rejects any UPDATE that would change
-- profiles.storefront_tenant_id UNLESS the current session role
-- is service_role. This is a hard lock on top of RLS in case a
-- policy is added later that inadvertently opens the column.
CREATE OR REPLACE FUNCTION public.storefront_guard_profile_tenant_change()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.storefront_tenant_id IS DISTINCT FROM OLD.storefront_tenant_id THEN
    -- Service role has USER 'service_role' in Supabase; permit.
    IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' <> 'service_role' THEN
      RAISE EXCEPTION 'profiles.storefront_tenant_id can only be changed by an admin via the audited transfer endpoint'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_storefront_tenant_guard ON public.profiles;
CREATE TRIGGER trg_profiles_storefront_tenant_guard
  BEFORE UPDATE OF storefront_tenant_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.storefront_guard_profile_tenant_change();
