-- Location Services: capture the customer's location-needs questionnaire on the
-- subscription, and flag "any available locator" bookings (no specific locator).

ALTER TABLE public.location_service_subscriptions
  ADD COLUMN IF NOT EXISTS location_needs jsonb,
  ADD COLUMN IF NOT EXISTS any_locator boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
