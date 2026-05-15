-- Add commission target to sales_goals so goals can track commission payout targets
ALTER TABLE public.sales_goals
  ADD COLUMN IF NOT EXISTS target_commission NUMERIC(12,2) DEFAULT 0;
