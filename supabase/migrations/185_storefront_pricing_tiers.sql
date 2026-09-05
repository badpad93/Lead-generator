-- 185: owner-defined pricing tiers for coffee storefronts.
--
-- The storefront owner sets up to THREE price tiers and assigns each
-- of their customers to a tier. A customer's price for a product is
-- their tier's price for that product, falling back to the product's
-- list price when the owner hasn't set a tier price (so the owner
-- never has to fill every cell — prices already exist).
--
-- Replaces the single flat storefront_tenant_prices mechanism. The
-- existing flat prices are backfilled into Tier 1, and every existing
-- customer defaults to Tier 1, so nothing changes for anyone until the
-- owner sets up Tier 2/3 and reassigns.
--
-- Service-role access only (RLS enabled, no policies) — same posture
-- as the other storefront tables; all writes go through the
-- owner-authenticated API routes.

BEGIN;

-- Per-tier, per-product customer price.
CREATE TABLE IF NOT EXISTS public.storefront_tenant_tier_prices (
  tenant_id      uuid NOT NULL REFERENCES public.storefront_tenants(id) ON DELETE CASCADE,
  tier           smallint NOT NULL CHECK (tier BETWEEN 1 AND 3),
  product_id     uuid NOT NULL REFERENCES public.coffee_products(id) ON DELETE CASCADE,
  customer_price numeric(12,2) NOT NULL CHECK (customer_price >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  PRIMARY KEY (tenant_id, tier, product_id)
);
ALTER TABLE public.storefront_tenant_tier_prices ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.storefront_tenant_tier_prices IS
  'Owner-defined per-tier customer prices. A tenant has up to 3 tiers; a missing (tenant,tier,product) row falls back to the product list price.';

-- Customer -> tier assignment. No row = Tier 1.
CREATE TABLE IF NOT EXISTS public.storefront_customer_tiers (
  tenant_id          uuid NOT NULL REFERENCES public.storefront_tenants(id) ON DELETE CASCADE,
  customer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier               smallint NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 3),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid,
  PRIMARY KEY (tenant_id, customer_profile_id)
);
ALTER TABLE public.storefront_customer_tiers ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.storefront_customer_tiers IS
  'Which pricing tier (1-3) each enrolled customer is assigned to for a storefront. Absent row = Tier 1.';

-- Optional friendly tier names, so the owner can label tiers
-- ("Wholesale", "Retail", ...) and assignment reads naturally.
ALTER TABLE public.storefront_tenants
  ADD COLUMN IF NOT EXISTS price_tier_names jsonb NOT NULL
  DEFAULT '{"1":"Tier 1","2":"Tier 2","3":"Tier 3"}'::jsonb;
COMMENT ON COLUMN public.storefront_tenants.price_tier_names IS
  'Owner-facing labels for the three pricing tiers, keyed "1"/"2"/"3".';

-- Backfill: existing flat tenant prices become Tier 1 prices, so the
-- resolver (which now reads tier prices) keeps charging exactly what
-- it charged before for every already-enrolled customer.
INSERT INTO public.storefront_tenant_tier_prices (tenant_id, tier, product_id, customer_price, updated_at)
SELECT tenant_id, 1, product_id, customer_price, now()
  FROM public.storefront_tenant_prices
 WHERE coalesce(active, true) = true
ON CONFLICT (tenant_id, tier, product_id) DO NOTHING;

COMMIT;
