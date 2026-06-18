-- Add 'locator' role for users who find and sell location leads on the marketplace
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('operator', 'locator', 'location_manager', 'requestor', 'admin', 'sales', 'director_of_sales', 'market_leader'));
