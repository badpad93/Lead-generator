-- AI Vending Brands: public brand pages with per-brand machine lineups.
--
-- A brand is a public marketing entity (name, slug, logo, blurb). Machines are
-- the existing sellable `machine_listings`, assigned to a brand via brand_id.
-- Public-read RLS; all writes go through the service role (admin). Logos live
-- in a public bucket. Mirrors the smart_cooler_machines / marketing_gondola
-- pattern.

CREATE TABLE IF NOT EXISTS public.vending_brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  blurb       text,
  logo_path   text,                        -- object key in the vending-brand-logos bucket
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vending_brands_sort ON public.vending_brands (active, sort_order);

ALTER TABLE public.vending_brands ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'read_vending_brands') THEN
    CREATE POLICY read_vending_brands ON public.vending_brands FOR SELECT USING (true);
  END IF;
END $$;

-- Public bucket for brand logos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('vending-brand-logos', 'vending-brand-logos', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vending_brand_logos_public_read') THEN
    CREATE POLICY vending_brand_logos_public_read ON storage.objects
      FOR SELECT TO anon, authenticated USING (bucket_id = 'vending-brand-logos');
  END IF;
END $$;

-- Assign a machine listing to a brand's lineup (NULL = unassigned).
ALTER TABLE public.machine_listings
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.vending_brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_machine_listings_brand ON public.machine_listings (brand_id);

-- Financing can reference the machine the application is for (NULL = standalone).
ALTER TABLE public.financing_applications
  ADD COLUMN IF NOT EXISTS machine_listing_id uuid REFERENCES public.machine_listings(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
