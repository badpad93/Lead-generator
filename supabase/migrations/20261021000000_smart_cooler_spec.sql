-- Smart Coolers: per-machine spec sheet (PDF or image) shown via "See specs".
--
-- Stored in the existing public `smart-cooler-machines` bucket (service-role
-- writes, public read). Adds one nullable column for the object key.

ALTER TABLE public.smart_cooler_machines
  ADD COLUMN IF NOT EXISTS spec_path text;

NOTIFY pgrst, 'reload schema';
