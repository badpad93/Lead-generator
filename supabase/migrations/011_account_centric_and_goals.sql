-- ==========================================================
-- Sales CRM: account-centric model + goals + assignments
-- Run in Supabase SQL Editor
-- ==========================================================

-- 1. Link leads to accounts (one account = many leads possible)
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.sales_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_leads_account ON public.sales_leads(account_id);

-- 2. Account ownership / creator
ALTER TABLE public.sales_accounts
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_sales_accounts_assigned ON public.sales_accounts(assigned_to);

-- 3. Sales goals (admin-set targets per rep)
CREATE TABLE IF NOT EXISTS public.sales_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  target_revenue numeric(12,2) NOT NULL DEFAULT 0,
  target_deals integer NOT NULL DEFAULT 0,
  target_leads integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period)
);
CREATE INDEX IF NOT EXISTS idx_sales_goals_user ON public.sales_goals(user_id);

ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_sales_goals') THEN
    CREATE POLICY service_role_sales_goals ON public.sales_goals FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
