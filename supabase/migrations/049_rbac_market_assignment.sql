-- RBAC: Add market_assignment to deals, pipeline_items, leads, and accounts
-- Values: NULL (unassigned), 'ALL' (visible to all market leaders), or a market leader's user_id

ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS market_assignment TEXT;
ALTER TABLE public.pipeline_items ADD COLUMN IF NOT EXISTS market_assignment TEXT;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS market_assignment TEXT;
ALTER TABLE public.sales_accounts ADD COLUMN IF NOT EXISTS market_assignment TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_deals_market ON public.sales_deals(market_assignment);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_market ON public.pipeline_items(market_assignment);
CREATE INDEX IF NOT EXISTS idx_sales_leads_market ON public.sales_leads(market_assignment);
CREATE INDEX IF NOT EXISTS idx_sales_accounts_market ON public.sales_accounts(market_assignment);
