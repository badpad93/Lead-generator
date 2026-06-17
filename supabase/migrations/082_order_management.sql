-- Order Management System: extend sales_orders and order_items, add activity log and documents

-- Extend sales_orders with full order management fields
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES sales_leads(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS assigned_rep_id UUID REFERENCES auth.users(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS order_number SERIAL;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'draft';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS order_type TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT false;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS invoice_status TEXT DEFAULT 'not_sent';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS agreement_status TEXT DEFAULT 'not_sent';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'pending';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS next_required_action TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Extend order_items with richer fields
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'other';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_price NUMERIC DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
-- Location service deposit fields
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS location_service_price NUMERIC;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS location_deposit_amount NUMERIC;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS location_deposit_paid BOOLEAN DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS location_remaining_balance NUMERIC;

-- Order activity log
CREATE TABLE IF NOT EXISTS order_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_activity_order ON order_activity_log(order_id);

-- Order documents
CREATE TABLE IF NOT EXISTS order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  document_type TEXT,
  file_name TEXT,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_documents_order ON order_documents(order_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_sales_orders_order_status ON sales_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_assigned_rep ON sales_orders(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_lead_id ON sales_orders(lead_id);

-- Add 'won' status to sales_leads if not present (for CRM simplification)
-- The status column is just text, so no enum change needed
