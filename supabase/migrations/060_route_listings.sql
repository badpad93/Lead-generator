-- Create route_listings table (was defined in schema.sql but never had a numbered migration)
CREATE TABLE IF NOT EXISTS public.route_listings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  city text NOT NULL,
  state text NOT NULL,
  num_machines integer NOT NULL,
  num_locations integer NOT NULL,
  monthly_revenue numeric,
  asking_price numeric,
  machine_types text[] NOT NULL DEFAULT '{}',
  location_types text[] NOT NULL DEFAULT '{}',
  includes_equipment boolean NOT NULL DEFAULT true,
  includes_contracts boolean NOT NULL DEFAULT true,
  contact_email text,
  contact_phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'pending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.route_listings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='route_listings' AND policyname='Route listings viewable by everyone') THEN
    CREATE POLICY "Route listings viewable by everyone"
      ON public.route_listings FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='route_listings' AND policyname='Authenticated users can create route listings') THEN
    CREATE POLICY "Authenticated users can create route listings"
      ON public.route_listings FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='route_listings' AND policyname='Owners can update own route listings') THEN
    CREATE POLICY "Owners can update own route listings"
      ON public.route_listings FOR UPDATE USING (auth.uid() = created_by);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='route_listings' AND policyname='Owners can delete own route listings') THEN
    CREATE POLICY "Owners can delete own route listings"
      ON public.route_listings FOR DELETE USING (auth.uid() = created_by);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_route_listings_created_by ON public.route_listings(created_by);
CREATE INDEX IF NOT EXISTS idx_route_listings_status ON public.route_listings(status);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_route_listings_updated_at ON public.route_listings;
CREATE TRIGGER set_route_listings_updated_at
  BEFORE UPDATE ON public.route_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
