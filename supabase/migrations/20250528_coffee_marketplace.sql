-- Coffee Marketplace tables

CREATE TABLE IF NOT EXISTS coffee_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coffee_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES coffee_categories(id),
  name text NOT NULL,
  sku text UNIQUE NOT NULL,
  description text,
  price numeric NOT NULL,
  image_url text,
  stock_status text DEFAULT 'in_stock' CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock')),
  unit text DEFAULT 'each',
  min_order_qty int DEFAULT 1,
  active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coffee_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES profiles(id),
  business_name text,
  contact_name text,
  email text,
  phone text,
  shipping_address text,
  shipping_city text,
  shipping_state text,
  shipping_zip text,
  num_locations int,
  existing_machines int,
  estimated_volume text,
  notes text,
  agreement_signed boolean DEFAULT false,
  agreement_signed_at timestamptz,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coffee_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES coffee_products(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS coffee_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES profiles(id),
  order_number text UNIQUE NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  shipping_name text,
  shipping_address text,
  shipping_city text,
  shipping_state text,
  shipping_zip text,
  shipping_phone text,
  subtotal numeric NOT NULL DEFAULT 0,
  shipping_estimate numeric DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coffee_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES coffee_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES coffee_products(id),
  product_name text NOT NULL,
  product_sku text,
  quantity int NOT NULL,
  unit_price numeric NOT NULL,
  line_total numeric NOT NULL
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coffee_access_enabled boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coffee_agreement_signed boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coffee_application_status text DEFAULT null;

-- Seed categories
INSERT INTO coffee_categories (name, slug, description, sort_order) VALUES
  ('Coffee Beans', 'coffee-beans', 'Whole bean coffee in bulk quantities', 1),
  ('Coffee Packets', 'coffee-packets', 'Single-serve and bulk coffee packets', 2),
  ('Ground Coffee', 'ground-coffee', 'Pre-ground coffee for drip and espresso machines', 3),
  ('Tea', 'tea', 'Assorted teas and tea bags', 4),
  ('Cups', 'cups', 'Hot and cold beverage cups', 5),
  ('Lids', 'lids', 'Cup lids for hot and cold drinks', 6),
  ('Sleeves', 'sleeves', 'Insulating cup sleeves', 7),
  ('Stirrers', 'stirrers', 'Beverage stirrers and stir sticks', 8),
  ('Straws', 'straws', 'Drinking straws for cold beverages', 9),
  ('Cleaning Supplies', 'cleaning-supplies', 'Machine cleaning and maintenance supplies', 10)
ON CONFLICT (slug) DO NOTHING;

-- Seed products
INSERT INTO coffee_products (category_id, name, sku, description, price, unit, min_order_qty) VALUES
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-beans'), 'House Blend Whole Bean 5lb', 'CB-HB-5LB', 'Medium roast house blend, 5lb bag', 42.99, 'bag', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-beans'), 'Dark Roast Whole Bean 5lb', 'CB-DR-5LB', 'Bold dark roast, 5lb bag', 44.99, 'bag', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'ground-coffee'), 'House Blend Ground 2lb', 'GC-HB-2LB', 'Medium roast house blend, pre-ground, 2lb bag', 18.99, 'bag', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'ground-coffee'), 'Espresso Grind 2lb', 'GC-ES-2LB', 'Fine espresso grind, 2lb bag', 21.99, 'bag', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'tea'), 'English Breakfast Tea 100ct', 'TEA-EB-100', 'Classic English Breakfast tea bags, box of 100', 14.99, 'box', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'tea'), 'Green Tea Variety Pack 80ct', 'TEA-GV-80', 'Assorted green tea bags, box of 80', 12.99, 'box', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'cups'), '12oz Hot Cups 1000ct', 'CUP-H12-1K', 'Single-wall paper hot cups, 12oz, case of 1000', 54.99, 'case', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'cups'), '16oz Hot Cups 1000ct', 'CUP-H16-1K', 'Single-wall paper hot cups, 16oz, case of 1000', 62.99, 'case', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'cups'), '16oz Cold Cups 1000ct', 'CUP-C16-1K', 'Clear PET cold cups, 16oz, case of 1000', 49.99, 'case', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'lids'), '12oz Hot Cup Lids 1000ct', 'LID-H12-1K', 'Dome lids for 12oz hot cups, case of 1000', 32.99, 'case', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'lids'), '16oz Hot Cup Lids 1000ct', 'LID-H16-1K', 'Dome lids for 16oz hot cups, case of 1000', 34.99, 'case', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'sleeves'), 'Cup Sleeves 1000ct', 'SLV-STD-1K', 'Kraft paper cup sleeves, fits 12-20oz cups, case of 1000', 28.99, 'case', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'stirrers'), 'Wooden Stir Sticks 1000ct', 'STR-WD-1K', 'Birch wood stir sticks, 5.5 inch, box of 1000', 8.99, 'box', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'stirrers'), 'Plastic Stirrers 1000ct', 'STR-PL-1K', 'Black plastic stirrers, 7 inch, box of 1000', 6.99, 'box', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'straws'), 'Paper Straws 500ct', 'STW-PP-500', 'Eco-friendly paper straws, 7.75 inch, box of 500', 12.99, 'box', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'straws'), 'Plastic Straws 500ct', 'STW-PL-500', 'Wrapped plastic straws, 7.75 inch, box of 500', 9.99, 'box', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'cleaning-supplies'), 'Espresso Machine Descaler 32oz', 'CLN-DESC-32', 'Liquid descaler for espresso machines, 32oz bottle', 16.99, 'bottle', 1),
  ((SELECT id FROM coffee_categories WHERE slug = 'cleaning-supplies'), 'Brewer Cleaning Tablets 90ct', 'CLN-TAB-90', 'Cleaning tablets for automatic brewers, 90 count', 24.99, 'container', 1)
ON CONFLICT (sku) DO NOTHING;
