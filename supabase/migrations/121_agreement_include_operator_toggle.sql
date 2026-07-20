-- Optional Operator section on agreements
--
-- Adds an include/exclude toggle for the Operator Information block on
-- purchase_agreements, mirroring the existing pattern for
-- include_equipment, include_location_services, include_shipping_storage
-- (migration 090) and include_placement_terms / include_compensation
-- (migration 092).
--
-- Rationale: for location placement agreements, admin often builds the
-- contract before an operator has been matched. Being able to exclude
-- the operator section lets the agreement stand on its own and the
-- operator info be attached later.
--
-- Default TRUE preserves existing equipment agreements — they always
-- required operator info. Admin can flip it off per-agreement when
-- appropriate.

ALTER TABLE purchase_agreements
  ADD COLUMN IF NOT EXISTS include_operator boolean DEFAULT true;
