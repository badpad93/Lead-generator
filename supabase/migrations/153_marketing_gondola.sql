-- Migration 153: marketing gondola image overrides
--
-- Backs the /admin/marketing/gondola uploader that lets an admin
-- swap out any of the 5 marketing carousel photos without a code
-- push. When a row exists for a slot, the public gondola component
-- renders that image; otherwise it falls back to the placeholder
-- SVG shipped in git under /public/images/marketing.
--
-- Data model
--   marketing_gondola_images
--     slot          text  PK  — one of the 5 gondola slot ids
--                              (matches SLIDES[].id in
--                               src/app/components/marketing/
--                               MarketingGondola.tsx)
--     storage_path  text NOT NULL — object key inside the
--                                    'marketing-gondola' bucket
--     content_type  text NULL
--     uploaded_at   timestamptz NOT NULL default now()
--     uploaded_by   uuid NULL references auth.users(id)
--
-- The slot is the PK — one uploaded image per slot at a time. A
-- fresh upload UPSERTs by slot and removes the previous object.
--
-- Storage bucket
--   'marketing-gondola'  — PUBLIC read (gondola renders on the
--                          logged-out homepage, so public read is
--                          the correct choice). Writes are gated
--                          server-side by the admin route using the
--                          service role key — no client-issued
--                          uploads.

CREATE TABLE IF NOT EXISTS public.marketing_gondola_images (
  slot          text PRIMARY KEY
                CHECK (slot IN ('coffee', '10-10-10', 'financing', 'ai-vending', 'website-services')),
  storage_path  text NOT NULL,
  content_type  text,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.marketing_gondola_images ENABLE ROW LEVEL SECURITY;

-- Everyone (anon + authenticated) may read; the URLs need to render
-- on the public homepage.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'marketing_gondola_images'
      AND policyname = 'read_marketing_gondola_images'
  ) THEN
    CREATE POLICY read_marketing_gondola_images
      ON public.marketing_gondola_images
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Writes only happen through the admin API using supabaseAdmin
-- (service-role key bypasses RLS). We intentionally do NOT grant a
-- write policy — same pattern as manufacturer_partners and every
-- other admin-managed table in this app.

-- Public bucket for the gondola images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-gondola', 'marketing-gondola', true)
ON CONFLICT (id) DO NOTHING;

-- Read: anyone may fetch objects (bucket is already public=true so
-- this policy is belt-and-suspenders in case a future migration
-- flips public=false).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'marketing_gondola_public_read'
  ) THEN
    CREATE POLICY marketing_gondola_public_read
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'marketing-gondola');
  END IF;
END $$;

-- No client write policy — admin uploads run through the server
-- with the service role key.

NOTIFY pgrst, 'reload schema';
