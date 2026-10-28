-- Smart Coolers (AI coolers) settings — singleton row.
--
-- Holds the admin-editable lead-time / estimated-delivery banner shown on the
-- machine purchase surfaces (/smart-coolers, the checkout, brand pages). Edited
-- in the admin panel under the Smart Coolers tab.

CREATE TABLE IF NOT EXISTS public.smart_cooler_settings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_banner_enabled boolean NOT NULL DEFAULT false,
  purchase_banner_message text NOT NULL DEFAULT '',
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES auth.users(id)
);

-- Seed the singleton so reads never miss (the helper also falls back to defaults).
INSERT INTO public.smart_cooler_settings (purchase_banner_enabled, purchase_banner_message)
SELECT false, ''
WHERE NOT EXISTS (SELECT 1 FROM public.smart_cooler_settings);

ALTER TABLE public.smart_cooler_settings ENABLE ROW LEVEL SECURITY;

-- Public read (the banner is shown to anonymous shoppers); writes go through
-- the service role (admin route).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'read_smart_cooler_settings') THEN
    CREATE POLICY read_smart_cooler_settings ON public.smart_cooler_settings FOR SELECT USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
