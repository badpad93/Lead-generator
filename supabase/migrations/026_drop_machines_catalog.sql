-- ==========================================================
-- Drop Machines Catalog
-- ==========================================================
-- Removes the Apex-branded new-machines catalog (machines,
-- machine_orders, financing_requests) previously introduced in
-- migrations 023 and 024. The user-driven marketplace defined
-- in migration 025 (machine_listings) replaces it.
--
-- Drop order is important: financing_requests has a FK to
-- machine_orders, and machine_orders has a FK to machines.
-- ==========================================================

-- Child table first (references machine_orders)
DROP TABLE IF EXISTS public.financing_requests CASCADE;

-- Orders table (references machines)
DROP TABLE IF EXISTS public.machine_orders CASCADE;

-- Catalog table
DROP TABLE IF EXISTS public.machines CASCADE;

-- Reload PostgREST schema so API drops the old endpoints
NOTIFY pgrst, 'reload schema';
