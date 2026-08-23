-- Migration 154: add 'location-services' to the gondola slot allowlist
--
-- Widens the CHECK constraint on marketing_gondola_images.slot
-- introduced in migration 153 to accept a 6th slot for the new
-- Location Services slide. Existing rows (5 legacy slots) stay
-- valid — the new value is purely additive.
--
-- The constraint has to be dropped and re-added; Postgres has no
-- CHECK-constraint-alter syntax. Rows are untouched.

ALTER TABLE public.marketing_gondola_images
  DROP CONSTRAINT IF EXISTS marketing_gondola_images_slot_check;

ALTER TABLE public.marketing_gondola_images
  ADD  CONSTRAINT marketing_gondola_images_slot_check
       CHECK (slot IN (
         'coffee',
         '10-10-10',
         'financing',
         'ai-vending',
         'website-services',
         'location-services'
       ));

NOTIFY pgrst, 'reload schema';
