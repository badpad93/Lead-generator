-- ==========================================================
-- Sales CRM Tables for VendingConnector
-- Run in Supabase SQL Editor
-- ==========================================================

-- 1. Sales Leads
CREATE TABLE IF NOT EXISTS public.sales_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified')),
  assigned_to uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Accounts (customers)
CREATE TABLE IF NOT EXISTS public.sales_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Deals
CREATE TABLE IF NOT EXISTS public.sales_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.sales_leads(id),
  account_id uuid REFERENCES public.sales_accounts(id),
  assigned_to uuid REFERENCES auth.users(id),
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'qualified', 'proposal', 'closing', 'won', 'lost')),
  value numeric(12,2) DEFAULT 0,
  business_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Deal Services
CREATE TABLE IF NOT EXISTS public.deal_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.sales_deals(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sold', 'fulfilled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Orders
CREATE TABLE IF NOT EXISTS public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.sales_deals(id),
  account_id uuid REFERENCES public.sales_accounts(id),
  created_by uuid REFERENCES auth.users(id),
  total_value numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'completed')),
  recipient_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Documents
CREATE TABLE IF NOT EXISTS public.sales_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.sales_accounts(id),
  order_id uuid REFERENCES public.sales_orders(id),
  file_url text NOT NULL,
  type text NOT NULL DEFAULT 'order_pdf' CHECK (type IN ('order_pdf', 'contract', 'receipt')),
  file_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_leads_assigned ON public.sales_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_sales_leads_status ON public.sales_leads(status);
CREATE INDEX IF NOT EXISTS idx_sales_deals_stage ON public.sales_deals(stage);
CREATE INDEX IF NOT EXISTS idx_sales_deals_assigned ON public.sales_deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_deal_services_deal ON public.deal_services(deal_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_deal ON public.sales_orders(deal_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_documents_account ON public.sales_documents(account_id);

-- RLS (disable for now - access controlled via API auth)
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_documents ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (API uses supabaseAdmin)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_sales_leads') THEN
    CREATE POLICY service_role_sales_leads ON public.sales_leads FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_sales_accounts') THEN
    CREATE POLICY service_role_sales_accounts ON public.sales_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_sales_deals') THEN
    CREATE POLICY service_role_sales_deals ON public.sales_deals FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_deal_services') THEN
    CREATE POLICY service_role_deal_services ON public.deal_services FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_sales_orders') THEN
    CREATE POLICY service_role_sales_orders ON public.sales_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_order_items') THEN
    CREATE POLICY service_role_order_items ON public.order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_sales_documents') THEN
    CREATE POLICY service_role_sales_documents ON public.sales_documents FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Storage bucket for documents (run manually if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;
