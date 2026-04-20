-- Add director_of_sales role to profiles check constraint
-- First drop the old constraint, then add a new one with all roles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('operator', 'location_manager', 'requestor', 'admin', 'sales', 'director_of_sales'));
