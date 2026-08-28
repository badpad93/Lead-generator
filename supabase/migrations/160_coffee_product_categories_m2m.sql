-- Coffee products → categories many-to-many.
--
-- Today coffee_products has a single category_id foreign key, so a
-- product only ever surfaces in one section of the catalog. Admins have
-- asked to file the same product under multiple categories (e.g. a
-- "seasonal" blend that also lives under "coffee beans"). We introduce
-- a join table and backfill from the existing single-category rows.
--
-- coffee_products.category_id stays as the "primary" category — the
-- one that appears first on a product card, and the one that legacy
-- callers keep reading — so this migration is additive and does not
-- break the admin editor, the shopper feed, or the tier-price flow if
-- any of them are still on the old code path.

CREATE TABLE IF NOT EXISTS coffee_product_categories (
  product_id  uuid NOT NULL REFERENCES coffee_products(id)   ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES coffee_categories(id) ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_coffee_product_categories_category
  ON coffee_product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_coffee_product_categories_product
  ON coffee_product_categories(product_id);

ALTER TABLE coffee_product_categories ENABLE ROW LEVEL SECURITY;

-- Public catalog read — matches the coffee_products / coffee_categories
-- read policy so the storefront can hydrate categories without an admin
-- round-trip.
DROP POLICY IF EXISTS "Anyone can read coffee_product_categories" ON coffee_product_categories;
CREATE POLICY "Anyone can read coffee_product_categories"
  ON coffee_product_categories
  FOR SELECT
  USING (true);

-- Writes gated to admins. Service-role bypasses RLS so the admin
-- product API keeps working unchanged.
DROP POLICY IF EXISTS "Admins manage coffee_product_categories" ON coffee_product_categories;
CREATE POLICY "Admins manage coffee_product_categories"
  ON coffee_product_categories
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Backfill: every product that currently has a category_id gets a
-- junction row marked is_primary=true so the storefront's "primary
-- badge" behavior is preserved. Idempotent — the composite PK protects
-- against duplicate inserts if this migration is re-run.
INSERT INTO coffee_product_categories (product_id, category_id, is_primary)
SELECT id, category_id, true
  FROM coffee_products
 WHERE category_id IS NOT NULL
ON CONFLICT (product_id, category_id) DO NOTHING;
