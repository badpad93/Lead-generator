-- Migration 044: Add machine_type to locations
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS machine_type TEXT;

NOTIFY pgrst, 'reload schema';
