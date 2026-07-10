-- Account-level coffee pricing tiers.
--
-- Every coffee-enabled operator (a row in profiles with
-- coffee_access_enabled=true) belongs to exactly one pricing tier.
-- Each coffee product carries a price + shipping cost per tier.
-- Admin can edit any single (product, tier) cell without disturbing
-- the other two.
--
-- Money type: NUMERIC (matches the rest of the coffee stack —
-- coffee_products.price, coffee_orders.subtotal/total, and
-- coffee_order_items.unit_price are all numeric today). Postgres
-- NUMERIC is arbitrary-precision decimal, not floating point, so the
-- "no floats" invariant is satisfied.
--
-- Rollout is zero-downtime: tier prices for existing products are
-- backfilled to the current product.price so the resolver falls
-- through to sensible values on day one.

-- ═════════════════════════════════════════════════════════════════════
-- 1. Pricing tiers
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coffee_pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key text UNIQUE NOT NULL CHECK (tier_key ~ '^tier_[0-9]+$'),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coffee_pricing_tiers_active_sort
  ON coffee_pricing_tiers(is_active, sort_order);

INSERT INTO coffee_pricing_tiers (tier_key, name, description, sort_order)
VALUES
  ('tier_1', 'Tier 1', 'Standard / new operator pricing', 1),
  ('tier_2', 'Tier 2', 'Preferred pricing', 2),
  ('tier_3', 'Tier 3', 'Volume / partner pricing', 3)
ON CONFLICT (tier_key) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- 2. Per-product / per-tier prices
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coffee_product_tier_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES coffee_products(id) ON DELETE CASCADE,
  pricing_tier_id uuid NOT NULL REFERENCES coffee_pricing_tiers(id) ON DELETE RESTRICT,
  price numeric NOT NULL CHECK (price >= 0),
  shipping_cost numeric NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (product_id, pricing_tier_id)
);

CREATE INDEX IF NOT EXISTS idx_coffee_product_tier_prices_product
  ON coffee_product_tier_prices(product_id)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_coffee_product_tier_prices_tier
  ON coffee_product_tier_prices(pricing_tier_id)
  WHERE is_active = true;

-- ═════════════════════════════════════════════════════════════════════
-- 3. Account tier assignment
-- ═════════════════════════════════════════════════════════════════════
-- Nullable — null means "resolver falls through to Tier 1", which is
-- how new accounts default without a hard-set. Admin can promote later.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS coffee_pricing_tier_id uuid
    REFERENCES coffee_pricing_tiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_coffee_pricing_tier
  ON profiles(coffee_pricing_tier_id)
  WHERE coffee_pricing_tier_id IS NOT NULL;

-- ═════════════════════════════════════════════════════════════════════
-- 4. Historical snapshot on order lines
-- ═════════════════════════════════════════════════════════════════════
-- coffee_order_items already snapshots product_name, product_sku,
-- unit_price. Add pricing_tier_id so admin can trace which tier's
-- price a historical order actually paid.

ALTER TABLE coffee_order_items
  ADD COLUMN IF NOT EXISTS pricing_tier_id uuid
    REFERENCES coffee_pricing_tiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coffee_order_items_pricing_tier
  ON coffee_order_items(pricing_tier_id)
  WHERE pricing_tier_id IS NOT NULL;

-- ═════════════════════════════════════════════════════════════════════
-- 5. Backfill product×tier prices
-- ═════════════════════════════════════════════════════════════════════
-- For every existing coffee_products row, create Tier 1 / Tier 2 /
-- Tier 3 price rows mirroring the current product.price and
-- shipping_cost. Admin adjusts T2/T3 downward later — day-one behavior
-- is a no-op: every tier resolves to the same price the shop shows
-- today.
--
-- Idempotent: the unique (product_id, pricing_tier_id) constraint
-- + ON CONFLICT DO NOTHING protects against re-runs.

INSERT INTO coffee_product_tier_prices (product_id, pricing_tier_id, price, shipping_cost)
SELECT
  p.id,
  t.id,
  p.price,
  COALESCE(p.shipping_cost, 0)
FROM coffee_products p
CROSS JOIN coffee_pricing_tiers t
ON CONFLICT (product_id, pricing_tier_id) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- 6. RLS
-- ═════════════════════════════════════════════════════════════════════
-- All writes are admin-mediated via API routes using supabaseAdmin
-- (service role). Public reads are also mediated — the resolver is a
-- server-side helper that never exposes the full price matrix to
-- non-admin callers. So the tables are service-role-only, plus an
-- authenticated read policy on tier metadata (so the admin UI's
-- profile-edit modal can populate its tier dropdown without a
-- separate route).

ALTER TABLE coffee_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE coffee_product_tier_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON coffee_pricing_tiers;
CREATE POLICY "Service role only" ON coffee_pricing_tiers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone reads active tiers" ON coffee_pricing_tiers;
CREATE POLICY "Anyone reads active tiers" ON coffee_pricing_tiers
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Service role only" ON coffee_product_tier_prices;
CREATE POLICY "Service role only" ON coffee_product_tier_prices
  FOR ALL TO service_role USING (true) WITH CHECK (true);
