-- Migration 158: intake preferences on sales_leads
--
-- Adds three qualitative preference fields collected on
-- /request-location so the assigned rep sees them the moment they
-- open the lead. Nullable — legacy rows stay untouched.
--   * travel_radius_miles  — how far the operator will travel
--   * excluded_industries  — free-text list of industries they
--                            won't work in
--   * meeting_availability — free-text general availability for
--                            follow-up meetings

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS travel_radius_miles integer,
  ADD COLUMN IF NOT EXISTS excluded_industries text,
  ADD COLUMN IF NOT EXISTS meeting_availability text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_leads_travel_radius_check'
  ) THEN
    ALTER TABLE public.sales_leads
      ADD CONSTRAINT sales_leads_travel_radius_check
      CHECK (travel_radius_miles IS NULL OR travel_radius_miles >= 0);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
