-- ==========================================================
-- CRM Enforcement: validation, commissions, fulfillment, notifications
-- ==========================================================

-- 1. Deal locking — timestamp set when deal reaches won/lost
ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- 2. Sales commissions
CREATE TABLE IF NOT EXISTS public.sales_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.sales_deals(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.10,
  deal_value numeric(12,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_user ON public.sales_commissions(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_deal ON public.sales_commissions(deal_id);

ALTER TABLE public.sales_commissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_sales_commissions') THEN
    CREATE POLICY service_role_sales_commissions ON public.sales_commissions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Fulfillment checklist items
CREATE TABLE IF NOT EXISTS public.fulfillment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  label text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_items_order ON public.fulfillment_items(order_id);

ALTER TABLE public.fulfillment_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_fulfillment_items') THEN
    CREATE POLICY service_role_fulfillment_items ON public.fulfillment_items FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Notification emails on accounts (comma-separated CC list)
ALTER TABLE public.sales_accounts
  ADD COLUMN IF NOT EXISTS notification_emails text;
