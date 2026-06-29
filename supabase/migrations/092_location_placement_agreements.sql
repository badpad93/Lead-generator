-- Location Placement Agreements
-- Extends purchase_agreements with an agreement_type discriminator and
-- the location-placement-specific fields. The existing pipeline-driven
-- `location_agreements` flow is left untouched; this is a separate,
-- editor-driven location placement agreement that lives alongside
-- purchase agreements on /sales/agreements.

-- agreement_type already exists from migration 087 with default 'machine_purchase'.
-- We just need to broaden it to also accept 'location_placement'.
-- Drop and re-add the check constraint to include the new value.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'purchase_agreements'
      AND constraint_name = 'purchase_agreements_agreement_type_check'
  ) THEN
    ALTER TABLE purchase_agreements DROP CONSTRAINT purchase_agreements_agreement_type_check;
  END IF;
END $$;

ALTER TABLE purchase_agreements
  ADD CONSTRAINT purchase_agreements_agreement_type_check
  CHECK (agreement_type IN ('machine_purchase', 'location_placement'));

ALTER TABLE purchase_agreements

  -- Location contact (recipient of the agreement)
  ADD COLUMN IF NOT EXISTS location_business_name text,
  ADD COLUMN IF NOT EXISTS location_contact_name text,
  ADD COLUMN IF NOT EXISTS location_contact_email text,
  ADD COLUMN IF NOT EXISTS location_contact_phone text,
  ADD COLUMN IF NOT EXISTS location_contact_title text,
  ADD COLUMN IF NOT EXISTS location_address text,
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_state text,
  ADD COLUMN IF NOT EXISTS location_zip text,

  -- Placement terms
  ADD COLUMN IF NOT EXISTS placement_machine_count int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS placement_machine_type text,
  ADD COLUMN IF NOT EXISTS placement_installation_date date,
  ADD COLUMN IF NOT EXISTS placement_term_months int DEFAULT 24,
  ADD COLUMN IF NOT EXISTS placement_exclusivity boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS placement_notes text,

  -- Compensation
  ADD COLUMN IF NOT EXISTS commission_type text DEFAULT 'revenue_share'
    CHECK (commission_type IN ('revenue_share', 'flat_monthly', 'none')),
  ADD COLUMN IF NOT EXISTS commission_pct numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS commission_monthly_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_payout_schedule text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS commission_notes text,

  -- Operator (the vending company placing the machines)
  ADD COLUMN IF NOT EXISTS placement_operator_company text,
  ADD COLUMN IF NOT EXISTS placement_operator_contact text,
  ADD COLUMN IF NOT EXISTS placement_operator_email text,
  ADD COLUMN IF NOT EXISTS placement_operator_phone text,

  -- Sales rep handling this agreement (gets a copy when signed)
  ADD COLUMN IF NOT EXISTS rep_email text,
  ADD COLUMN IF NOT EXISTS rep_name text,

  -- Location placement section toggles (parallel to purchase agreement toggles)
  ADD COLUMN IF NOT EXISTS include_placement_terms boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_compensation boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_duration_termination boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_responsibilities boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_purchase_agreements_type ON purchase_agreements(agreement_type);
