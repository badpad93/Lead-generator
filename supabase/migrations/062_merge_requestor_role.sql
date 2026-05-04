-- Merge requestor role into location_manager
-- Both roles had identical functionality; simplifying to two customer roles:
-- "operator" (has machines, wants locations) and "location_manager" (has location, wants machines)

UPDATE public.profiles
SET role = 'location_manager'
WHERE role = 'requestor';
