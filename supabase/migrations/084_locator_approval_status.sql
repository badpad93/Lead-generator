-- Add locator approval status to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locator_status TEXT DEFAULT 'pending_approval';
