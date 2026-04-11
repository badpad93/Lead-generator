-- ==========================================================
-- Machine Listings (User-Driven Marketplace for Used Machines)
-- ==========================================================
-- Mirrors the route_listings pattern. Any operator can list a
-- used vending machine for sale. Listings start in 'pending'
-- status and an admin approves them to make them 'active'
-- (publicly visible on /machines-for-sale).
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.machine_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Listing copy
  title text NOT NULL,
  description text,

  -- Location
  city text NOT NULL,
  state text NOT NULL,

  -- Machine details
  machine_make text,
  machine_model text,
  machine_year integer,
  machine_type text,          -- e.g. "Snack", "Beverage", "Combo", "Coffee", "Micro Market"
  condition text CHECK (condition IN ('new', 'like_new', 'good', 'fair', 'for_parts')),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),

  -- Pricing
  asking_price numeric,

  -- What's included
  includes_card_reader boolean NOT NULL DEFAULT false,
  includes_install boolean NOT NULL DEFAULT false,
  includes_delivery boolean NOT NULL DEFAULT false,

  -- Media
  photos text[] NOT NULL DEFAULT '{}',

  -- Contact (private — stripped from public GET responses)
  contact_email text,
  contact_phone text,

  -- Moderation workflow
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'sold', 'rejected')),
  admin_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machine_listings_status ON public.machine_listings(status);
CREATE INDEX IF NOT EXISTS idx_machine_listings_created_by ON public.machine_listings(created_by);
CREATE INDEX IF NOT EXISTS idx_machine_listings_state ON public.machine_listings(state);
CREATE INDEX IF NOT EXISTS idx_machine_listings_created_at ON public.machine_listings(created_at DESC);

ALTER TABLE public.machine_listings ENABLE ROW LEVEL SECURITY;

-- Anyone can browse (public list page filters to status='active')
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'machine_listings_select_public') THEN
    CREATE POLICY machine_listings_select_public ON public.machine_listings
      FOR SELECT USING (true);
  END IF;
END $$;

-- Authenticated users can submit their own listings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'machine_listings_insert_own') THEN
    CREATE POLICY machine_listings_insert_own ON public.machine_listings
      FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
END $$;

-- Owners can update their own listings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'machine_listings_update_own') THEN
    CREATE POLICY machine_listings_update_own ON public.machine_listings
      FOR UPDATE USING (auth.uid() = created_by);
  END IF;
END $$;

-- Owners can delete their own listings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'machine_listings_delete_own') THEN
    CREATE POLICY machine_listings_delete_own ON public.machine_listings
      FOR DELETE USING (auth.uid() = created_by);
  END IF;
END $$;

-- Service role (admin) full access
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'machine_listings_service_role_all') THEN
    CREATE POLICY machine_listings_service_role_all ON public.machine_listings
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- updated_at trigger (touch_updated_at() exists from 024)
DROP TRIGGER IF EXISTS machine_listings_touch ON public.machine_listings;
CREATE TRIGGER machine_listings_touch
  BEFORE UPDATE ON public.machine_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
