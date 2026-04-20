-- Add market_leader role and create markets infrastructure
-- Markets are manually defined groups of reps. A market leader sees results for reps in their market(s).

-- 1. Update role constraint to include market_leader
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('operator', 'location_manager', 'requestor', 'admin', 'sales', 'director_of_sales', 'market_leader'));

-- 2. Markets table
CREATE TABLE IF NOT EXISTS public.sales_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Market members (reps assigned to a market)
CREATE TABLE IF NOT EXISTS public.market_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.sales_markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(market_id, user_id)
);

-- 4. Market leaders (who leads each market)
CREATE TABLE IF NOT EXISTS public.market_leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.sales_markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(market_id, user_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_market_members_user ON public.market_members(user_id);
CREATE INDEX IF NOT EXISTS idx_market_members_market ON public.market_members(market_id);
CREATE INDEX IF NOT EXISTS idx_market_leaders_user ON public.market_leaders(user_id);
CREATE INDEX IF NOT EXISTS idx_market_leaders_market ON public.market_leaders(market_id);
