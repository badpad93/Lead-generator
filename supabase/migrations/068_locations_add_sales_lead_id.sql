-- Migration 068: Add sales_lead_id to locations table
--
-- The lead creation code (POST /api/sales/leads) writes sales_lead_id when
-- creating a location-type lead, and the lead-to-pipeline conversion route
-- looks up locations by sales_lead_id. But the column was never added to the
-- locations table, so the link was silently lost and pipeline items ended up
-- with location_id = null.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS sales_lead_id UUID REFERENCES public.sales_leads(id);

CREATE INDEX IF NOT EXISTS idx_locations_sales_lead_id
  ON public.locations(sales_lead_id);

-- Backfill: match existing orphaned locations to their leads by location_name
-- matching sales_leads.business_name where entity_type = 'location'.
-- Only fills in rows where sales_lead_id is still null.
UPDATE public.locations loc
SET sales_lead_id = sl.id
FROM public.sales_leads sl
WHERE loc.sales_lead_id IS NULL
  AND sl.entity_type = 'location'
  AND loc.location_name IS NOT NULL
  AND (
    loc.location_name = sl.business_name
    OR (loc.decision_maker_email IS NOT NULL AND loc.decision_maker_email = sl.email)
  );

-- Also backfill pipeline_items that are missing location_id but have a lead_id
-- with a linked location.
UPDATE public.pipeline_items pi
SET location_id = loc.id
FROM public.locations loc
WHERE pi.location_id IS NULL
  AND pi.lead_id IS NOT NULL
  AND loc.sales_lead_id = pi.lead_id;
