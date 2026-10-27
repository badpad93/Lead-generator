-- Location Services: hire a locator on a recurring weekly basis.
--
-- Admin-managed locator profiles (name, bio, region, hourly rate, headshot)
-- shown on a public /locators page. A customer picks a locator + hours/week
-- (multiples of 5, minimum 15); the weekly amount (hourly x hours) is charged
-- up front and then re-billed every week by a scheduled sweep until cancelled.

-- Admin-editable locator profiles (public-read; service-role writes).
CREATE TABLE IF NOT EXISTS public.location_service_locators (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  headline          text,              -- short title, e.g. "Senior Placement Specialist"
  bio               text,
  region            text,              -- coverage area / specialties
  email             text,              -- locator contact (for cancellation notices)
  phone             text,
  hourly_rate_cents integer NOT NULL DEFAULT 0,
  headshot_path     text,              -- object key in the location-service-locators bucket
  active            boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ls_locators_sort ON public.location_service_locators (active, sort_order);

ALTER TABLE public.location_service_locators ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'read_ls_locators') THEN
    CREATE POLICY read_ls_locators ON public.location_service_locators FOR SELECT USING (true);
  END IF;
END $$;

-- Public bucket for locator headshots.
INSERT INTO storage.buckets (id, name, public)
VALUES ('location-service-locators', 'location-service-locators', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ls_locators_public_read') THEN
    CREATE POLICY ls_locators_public_read ON storage.objects
      FOR SELECT TO anon, authenticated USING (bucket_id = 'location-service-locators');
  END IF;
END $$;

-- A recurring weekly location-services subscription. The buyer stays a guest
-- (no account required); invoices are emailed. Service-role only.
CREATE TABLE IF NOT EXISTS public.location_service_subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locator_id          uuid REFERENCES public.location_service_locators(id) ON DELETE SET NULL,
  user_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name           text,
  email               text,
  phone               text,
  hours_per_week      integer NOT NULL,
  hourly_rate_cents   integer NOT NULL,
  weekly_amount_cents integer NOT NULL,
  status              text NOT NULL DEFAULT 'active',   -- active | cancelled | past_due
  call_requested      boolean NOT NULL DEFAULT true,
  qb_invoice_id       text,                              -- most recent invoice
  invoices_count      integer NOT NULL DEFAULT 0,
  last_billed_at      timestamptz,
  next_bill_at        timestamptz,                       -- when the next weekly invoice is due
  cancelled_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ls_subs_due ON public.location_service_subscriptions (status, next_bill_at);
CREATE INDEX IF NOT EXISTS idx_ls_subs_locator ON public.location_service_subscriptions (locator_id);

ALTER TABLE public.location_service_subscriptions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
