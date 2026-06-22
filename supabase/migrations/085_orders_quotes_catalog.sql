-- Add quote support to orders and create catalog items table

-- Add document_type to distinguish orders from quotes
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'order';

-- Catalog items table for reusable items
CREATE TABLE IF NOT EXISTS catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  item_type TEXT DEFAULT 'other',
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sku TEXT,
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_active ON catalog_items(active);
