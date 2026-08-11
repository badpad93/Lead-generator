-- Coffee marketplace settings — singleton row
--
-- Holds the org-wide policy knobs the admin UI at /admin/coffee needs
-- to enforce at checkout time. Right now that's just a minimum-order
-- gate ($500 default) but the table is shaped so future policy toggles
-- (shipping thresholds, wholesale gates, cutoffs) can slot in without
-- another migration per knob.
--
-- Every coffee checkout path (authenticated + guest) reads this via
-- src/lib/coffeeSettings.ts before creating an order. UI reads the
-- same helper to display the minimum on the cart drawer / checkout
-- page so buyers see the gate before hitting Place Order.

CREATE TABLE IF NOT EXISTS public.coffee_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Minimum order subtotal (line items only, excluding shipping)
  -- required for a coffee order to be placed. Set in cents to avoid
  -- floating-point drift; UI converts for display.
  minimum_order_cents integer NOT NULL DEFAULT 50000
    CHECK (minimum_order_cents >= 0),
  -- Kill switch — flip false to let orders under the minimum through
  -- without a code deploy (helpful for a one-off promo or a stuck
  -- customer we need to unblock).
  minimum_order_enforced boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Seed the singleton row so getCoffeeSettings() never returns null on
-- a fresh install. The helper falls back to defaults if the row is
-- missing, but seeding here is safer than relying on that path.
INSERT INTO public.coffee_settings (minimum_order_cents, minimum_order_enforced)
SELECT 50000, true
WHERE NOT EXISTS (SELECT 1 FROM public.coffee_settings);

ALTER TABLE public.coffee_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'coffee_settings'
                   AND policyname = 'service_role_coffee_settings') THEN
    CREATE POLICY service_role_coffee_settings
      ON public.coffee_settings FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
