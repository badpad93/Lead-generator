-- Storefront pricing overrides — per-tenant markups + per-customer prices.
--
-- Per spec § "Master Catalog and Pricing Engine" the resolver
-- precedence at checkout is:
--   1. Accepted customer quote/contract price
--   2. Customer-specific price assignment
--   3. Operator-configured customer price
--   4. Operator's general retail price
--   5. Apex recommended retail price
--   6. Platform fallback price
-- and "No price may resolve below the applicable Apex base price."
--
-- The catalog + tier system already covers #4-#6 through
-- coffee_pricing_tiers + coffee_product_tier_prices. This migration
-- adds the two tenant-scoped layers:
--
--   #3 storefront_tenant_prices    — tenant sets a customer-
--      facing markup on top of their assigned base tier, per
--      product. Applied to every customer of that tenant unless
--      a per-customer override exists.
--
--   #2 storefront_customer_prices  — tenant assigns a specific
--      per-product price to a single customer. Wins over the
--      tenant default.
--
-- #1 (accepted quote lines) reuses the existing
-- coffee_pricing_proposals structure and is threaded through the
-- resolver in a later commit — no new table required for that.
--
-- Money is NUMERIC(12,2). CHECK constraints enforce non-negative
-- and (defense in depth) prevent an INSERT below zero.

-- ─── storefront_tenant_prices ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.storefront_tenant_prices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.storefront_tenants(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.coffee_products(id) ON DELETE CASCADE,

  -- The customer-facing price the tenant wants EVERY customer of
  -- theirs to see for this product. Must be >= the base tier
  -- price at the time of INSERT (enforced in the application
  -- layer; a bad DB write is still refused at checkout by the
  -- resolver + the coffee_order_items floor CHECK from 168).
  customer_price   numeric(12,2) NOT NULL CHECK (customer_price >= 0),

  -- Optional: mark this row as "recommended by Apex" vs.
  -- tenant-authored. Recommended entries can be seeded platform-
  -- wide by an admin; a tenant may override with their own row.
  is_recommended   boolean NOT NULL DEFAULT false,

  active           boolean NOT NULL DEFAULT true,
  effective_from   timestamptz NOT NULL DEFAULT now(),
  effective_to     timestamptz,

  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_storefront_tenant_prices_tenant
  ON public.storefront_tenant_prices(tenant_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_storefront_tenant_prices_product
  ON public.storefront_tenant_prices(product_id) WHERE active = true;

CREATE OR REPLACE FUNCTION public.storefront_tenant_prices_touch()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_storefront_tenant_prices_touch ON public.storefront_tenant_prices;
CREATE TRIGGER trg_storefront_tenant_prices_touch
  BEFORE UPDATE ON public.storefront_tenant_prices
  FOR EACH ROW EXECUTE FUNCTION public.storefront_tenant_prices_touch();

ALTER TABLE public.storefront_tenant_prices ENABLE ROW LEVEL SECURITY;

-- Tenant owner reads/writes their own tenant's prices.
DROP POLICY IF EXISTS "Owner manages tenant prices" ON public.storefront_tenant_prices;
CREATE POLICY "Owner manages tenant prices"
  ON public.storefront_tenant_prices FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM storefront_tenants t
    WHERE t.id = tenant_id AND t.owner_profile_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM storefront_tenants t
    WHERE t.id = tenant_id AND t.owner_profile_id = auth.uid()
  ));

-- Customers of a tenant read the prices they will actually be
-- charged. Anyone else in the tenant is invisible.
DROP POLICY IF EXISTS "Customer reads own tenant prices" ON public.storefront_tenant_prices;
CREATE POLICY "Customer reads own tenant prices"
  ON public.storefront_tenant_prices FOR SELECT TO authenticated
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.storefront_tenant_id = tenant_id
    )
  );

DROP POLICY IF EXISTS "Admins manage tenant prices" ON public.storefront_tenant_prices;
CREATE POLICY "Admins manage tenant prices"
  ON public.storefront_tenant_prices FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ─── storefront_customer_prices ──────────────────────────────────
-- Per-customer per-product price override. Wins over the tenant
-- default when a checkout resolves.
CREATE TABLE IF NOT EXISTS public.storefront_customer_prices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.storefront_tenants(id) ON DELETE CASCADE,
  customer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.coffee_products(id) ON DELETE CASCADE,

  customer_price   numeric(12,2) NOT NULL CHECK (customer_price >= 0),

  -- Optional source-of-truth marker: was this price set manually,
  -- copied from a quote, or promoted from an invitation? Helps
  -- reconciliation audits.
  source           text NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual','invitation','proposal','admin_override')),
  source_ref_id    uuid,  -- e.g. invitation id or proposal id

  active           boolean NOT NULL DEFAULT true,
  effective_from   timestamptz NOT NULL DEFAULT now(),
  effective_to     timestamptz,

  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (customer_profile_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_storefront_customer_prices_customer
  ON public.storefront_customer_prices(customer_profile_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_storefront_customer_prices_tenant
  ON public.storefront_customer_prices(tenant_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_storefront_customer_prices_source
  ON public.storefront_customer_prices(source, source_ref_id);

CREATE OR REPLACE FUNCTION public.storefront_customer_prices_touch()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_storefront_customer_prices_touch ON public.storefront_customer_prices;
CREATE TRIGGER trg_storefront_customer_prices_touch
  BEFORE UPDATE ON public.storefront_customer_prices
  FOR EACH ROW EXECUTE FUNCTION public.storefront_customer_prices_touch();

ALTER TABLE public.storefront_customer_prices ENABLE ROW LEVEL SECURITY;

-- Tenant owner reads/writes their tenant's customer prices.
DROP POLICY IF EXISTS "Owner manages customer prices" ON public.storefront_customer_prices;
CREATE POLICY "Owner manages customer prices"
  ON public.storefront_customer_prices FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM storefront_tenants t
    WHERE t.id = tenant_id AND t.owner_profile_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM storefront_tenants t
    WHERE t.id = tenant_id AND t.owner_profile_id = auth.uid()
  ));

-- Customer reads only their OWN price rows.
DROP POLICY IF EXISTS "Customer reads own prices" ON public.storefront_customer_prices;
CREATE POLICY "Customer reads own prices"
  ON public.storefront_customer_prices FOR SELECT TO authenticated
  USING (customer_profile_id = auth.uid() AND active = true);

DROP POLICY IF EXISTS "Admins manage customer prices" ON public.storefront_customer_prices;
CREATE POLICY "Admins manage customer prices"
  ON public.storefront_customer_prices FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
