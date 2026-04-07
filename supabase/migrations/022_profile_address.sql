-- Add street address to profiles (city/state/zip already exist).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address text;

NOTIFY pgrst, 'reload schema';
