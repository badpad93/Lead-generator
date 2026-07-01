-- Add 'sales_manager' role (sits between market_leader and sales)
-- See src/lib/salesAuth.ts and src/lib/permissions.ts for permissions.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('operator', 'locator', 'location_manager', 'requestor', 'admin', 'sales', 'sales_manager', 'director_of_sales', 'market_leader'));
