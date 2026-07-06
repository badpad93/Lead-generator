-- Lead → agreement + lead → public listing traceability.
--
-- When a sales rep converts a lead into a location placement agreement or
-- publishes it to the public marketplace, we record the linkage so the
-- lead row can show "already converted" state and prevent duplicates.

ALTER TABLE user_listings
  ADD COLUMN IF NOT EXISTS source_lead_id uuid REFERENCES sales_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_listings_source_lead
  ON user_listings(source_lead_id)
  WHERE source_lead_id IS NOT NULL;

ALTER TABLE sales_leads
  ADD COLUMN IF NOT EXISTS location_placement_agreement_id uuid REFERENCES purchase_agreements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS public_listing_id uuid REFERENCES user_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_leads_placement_agreement
  ON sales_leads(location_placement_agreement_id)
  WHERE location_placement_agreement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_leads_public_listing
  ON sales_leads(public_listing_id)
  WHERE public_listing_id IS NOT NULL;
