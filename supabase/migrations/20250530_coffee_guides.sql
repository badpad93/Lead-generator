-- How-to Guides for the Coffee Marketplace
CREATE TABLE IF NOT EXISTS coffee_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  summary text,
  content text NOT NULL,
  image_url text,
  category_id uuid REFERENCES coffee_categories(id) ON DELETE SET NULL,
  sort_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE coffee_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active guides"
  ON coffee_guides FOR SELECT
  USING (active = true);
