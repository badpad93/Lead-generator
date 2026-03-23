-- ============================================================
-- Enable Supabase Realtime on tables that need live updates
-- ============================================================

-- vending_requests: buyers see live contact-info updates from admin,
-- browse page removes leads when purchased.
ALTER PUBLICATION supabase_realtime ADD TABLE public.vending_requests;

-- lead_purchases: Your Leads page and request detail page react
-- to purchase status changing from pending → completed.
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_purchases;
