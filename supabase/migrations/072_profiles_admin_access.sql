-- Ensure profiles role CHECK constraint includes all CRM roles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('operator', 'location_manager', 'requestor', 'admin', 'sales', 'director_of_sales', 'market_leader'));

-- Ensure service_role (used by admin API) can perform all operations on profiles
-- This is needed because the default RLS only allows users to update their own profile
CREATE POLICY "service_role_full_access_profiles"
  ON public.profiles FOR ALL
  USING (true)
  WITH CHECK (true);
