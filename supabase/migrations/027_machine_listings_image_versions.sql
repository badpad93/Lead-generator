-- ==========================================================
-- Machine Listings: Structured Image Version URLs
-- ==========================================================
-- Adds optimized multi-size image fields to machine_listings.
--
-- Uploaded images are processed server-side (Node + sharp) into
-- WebP versions at three widths:
--   thumb  = 300 px  → image_thumb_url
--   medium = 800 px  → image_medium_url
--   main   = 1200 px → image_main_url
--
-- The existing `photos text[]` column is preserved for backward
-- compatibility and for PDFs / additional gallery images. Legacy
-- listings without structured URLs continue to render via the
-- fallback path in the frontend.
-- ==========================================================

ALTER TABLE public.machine_listings
  ADD COLUMN IF NOT EXISTS image_thumb_url  text,
  ADD COLUMN IF NOT EXISTS image_medium_url text,
  ADD COLUMN IF NOT EXISTS image_main_url   text;

COMMENT ON COLUMN public.machine_listings.image_thumb_url IS
  'Optimized thumbnail (300w WebP) of primary image. Rendered on listing cards.';
COMMENT ON COLUMN public.machine_listings.image_medium_url IS
  'Optimized medium (800w WebP) of primary image. Rendered on smaller detail views.';
COMMENT ON COLUMN public.machine_listings.image_main_url IS
  'Optimized main display (1200w WebP) of primary image. Hero on the detail page.';

NOTIFY pgrst, 'reload schema';
