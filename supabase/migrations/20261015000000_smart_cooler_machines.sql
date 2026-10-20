-- Smart Coolers landing page (/smart-coolers): admin-editable machine grid.
--
-- The public page previously hardcoded its "popular machines" grid. This moves
-- that content into a table an admin can edit (name, specs, price, photo, order,
-- active flag). Mirrors the marketing_gondola pattern: public-read RLS, all
-- writes through the service role, photos in a public storage bucket.

CREATE TABLE IF NOT EXISTS public.smart_cooler_machines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  bottles     text,
  shelves     text,
  cameras     text,
  warranty    text,
  starting_at text,
  image_path  text,                       -- object key in the smart-cooler-machines bucket; NULL = grey placeholder
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_cooler_machines_sort
  ON public.smart_cooler_machines (active, sort_order);

ALTER TABLE public.smart_cooler_machines ENABLE ROW LEVEL SECURITY;

-- Public read; writes go through the service role (no client write policy),
-- the same pattern as marketing_gondola and every other admin-managed table.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'read_smart_cooler_machines') THEN
    CREATE POLICY read_smart_cooler_machines ON public.smart_cooler_machines FOR SELECT USING (true);
  END IF;
END $$;

-- Public storage bucket for machine photos (rendered on the public page).
INSERT INTO storage.buckets (id, name, public)
VALUES ('smart-cooler-machines', 'smart-cooler-machines', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'smart_cooler_machines_public_read') THEN
    CREATE POLICY smart_cooler_machines_public_read ON storage.objects
      FOR SELECT TO anon, authenticated USING (bucket_id = 'smart-cooler-machines');
  END IF;
END $$;

-- Seed with the eight machines the page currently ships (photos added later).
INSERT INTO public.smart_cooler_machines (name, bottles, shelves, cameras, warranty, starting_at, sort_order)
VALUES
  ('Micromart Fridge Smart Store',     '378 bottles', '5 shelves',  '4x cameras', '3/5 year warranty', '$6,295', 1),
  ('Summit Pro 542 AI Smart Cooler',   '378 bottles', '6 shelves',  '2x cameras', '1 year warranty',   '$4,699', 2),
  ('Summit Plus 440 AI Smart Cooler',  '324 bottles', '6 shelves',  '2x cameras', '1 year warranty',   '$3,850', 3),
  ('Vantage Elite Smart Cooler',       '450 bottles', '6 shelves',  '2x cameras', '1 year warranty',   '$5,999', 4),
  ('Vantage Prime Smart Cooler',       '360 bottles', '5 shelves',  '2x cameras', '1 year warranty',   '$4,999', 5),
  ('Corner Core AI Smart Cooler',      '300+ bottles','6 shelves',  '3x cameras', '2/5 year warranty', '$3,995', 6),
  ('Summit Ultra 1200 AI Smart Cooler','756 bottles', '12 shelves', '4x cameras', '1 year warranty',   '$7,199', 7),
  ('Summit Mini 360 AI Smart Cooler',  '252 bottles', '6 shelves',  '2x cameras', '1 year warranty',   '$3,449', 8)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
