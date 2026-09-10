-- ============================================================================
-- Vinnie vending business plans (canonical, versioned, customer-owned).
-- ============================================================================
-- Forward-only, idempotent. One new table and its sequence; nothing else
-- altered. A plan row stores the customer-confirmed inputs, the live
-- catalog snapshot the estimate used, the engine version, and the
-- deterministic outputs, plus references to the quote and financing
-- application the plan led to. No price, cost, commission, margin,
-- QuickBooks, credential, or sensitive financing column exists here by
-- design: catalog prices live in catalog_items, sensitive financing data
-- lives only in financing_applications.
--
-- Security model (both layers are load-bearing):
--   * Postgres grants: anon has nothing; authenticated has SELECT only;
--     every write goes through service-role server routes.
--   * RLS: the authenticated policy checks auth.uid() ownership.

CREATE SEQUENCE IF NOT EXISTS public.commerce_business_plan_number_seq;

CREATE TABLE IF NOT EXISTS public.commerce_business_plans (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  thread_id                 uuid REFERENCES public.assistant_threads(id) ON DELETE SET NULL,
  plan_number               text NOT NULL UNIQUE
                              DEFAULT ('VP-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.commerce_business_plan_number_seq')::text, 4, '0')),
  version                   integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  engine_version            text NOT NULL,
  status                    text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','confirmed','quoted','archived')),
  package                   text NOT NULL
                              CHECK (package IN ('ten_ten_ten','five_machine','single_machine')),
  website_included          boolean NOT NULL DEFAULT true,
  website_decision          text NOT NULL DEFAULT 'default'
                              CHECK (website_decision IN ('default','accepted','declined')),
  inputs                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  catalog_snapshot          jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  quote_id                  uuid REFERENCES public.commerce_quotes(id) ON DELETE SET NULL,
  financing_status          text NOT NULL DEFAULT 'none'
                              CHECK (financing_status IN ('none','application_started','application_submitted')),
  financing_application_id  uuid REFERENCES public.financing_applications(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commerce_business_plans IS
  'Customer-owned Vinnie vending business plan: confirmed inputs, catalog snapshot, engine version, deterministic outputs, and the quote/financing references it led to. Illustrative projections only.';

CREATE INDEX IF NOT EXISTS commerce_business_plans_user_idx ON public.commerce_business_plans (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS commerce_business_plans_thread_idx ON public.commerce_business_plans (thread_id) WHERE thread_id IS NOT NULL;

-- ─── updated_at (function introduced by 20260907221654; re-created idempotently) ──
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS commerce_business_plans_touch ON public.commerce_business_plans;
CREATE TRIGGER commerce_business_plans_touch BEFORE UPDATE ON public.commerce_business_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Grants ─────────────────────────────────────────────────────────────────
REVOKE ALL PRIVILEGES ON TABLE public.commerce_business_plans FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.commerce_business_plans FROM authenticated;
GRANT SELECT ON TABLE public.commerce_business_plans TO authenticated;
REVOKE ALL ON SEQUENCE public.commerce_business_plan_number_seq FROM anon, authenticated;

-- ─── Row level security ─────────────────────────────────────────────────────
ALTER TABLE public.commerce_business_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commerce_business_plans_service_role ON public.commerce_business_plans;
CREATE POLICY commerce_business_plans_service_role ON public.commerce_business_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS commerce_business_plans_owner_select ON public.commerce_business_plans;
CREATE POLICY commerce_business_plans_owner_select ON public.commerce_business_plans
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
