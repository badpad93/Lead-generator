-- ==========================================================
-- Machines Catalog
-- ==========================================================
-- A simple catalog of vending machines available for purchase
-- through the VendingConnector marketplace. Apex AI Vending is
-- the vendor of record; all orders flow through Apex.
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  model text,
  short_description text,
  description text,
  image_url text,
  price_cents integer NOT NULL,                    -- cash price per unit
  finance_estimate_monthly_cents integer,          -- ~monthly payment estimate at 10yr
  finance_term_years integer DEFAULT 10,
  finance_rate_label text DEFAULT '8–14% APR',
  machine_type text,                               -- snack / beverage / combo / coffee
  features text[] DEFAULT '{}',                    -- bullet list for product page
  specs jsonb DEFAULT '{}'::jsonb,                 -- free-form specs (dimensions, weight, etc.)
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machines_active ON public.machines(active);
CREATE INDEX IF NOT EXISTS idx_machines_slug ON public.machines(slug);

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

-- Anyone can browse the catalog
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'machines_public_read') THEN
    CREATE POLICY machines_public_read ON public.machines
      FOR SELECT USING (active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'machines_service_role_all') THEN
    CREATE POLICY machines_service_role_all ON public.machines
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ==========================================================
-- Seed a few starter machines so the marketplace isn't empty.
-- These can be edited / added to in Supabase directly.
-- ==========================================================
INSERT INTO public.machines
  (slug, name, model, short_description, description, price_cents, finance_estimate_monthly_cents, machine_type, features, sort_order)
VALUES
  (
    'apex-combo-3000',
    'Apex Combo 3000',
    'AC-3000',
    'Snack + beverage combo machine with credit card reader and remote monitoring.',
    'The Apex Combo 3000 is our flagship combo machine — serves snacks and cold beverages from a single footprint. Includes cashless payment, telemetry, and LED interior lighting. Ideal for offices, gyms, and mid-traffic locations.',
    485000,
    18000,
    'combo',
    ARRAY[
      'Snack + cold drink combo',
      'Cashless card reader included',
      'Remote telemetry / inventory alerts',
      'LED interior lighting',
      'Energy-efficient compressor'
    ],
    1
  ),
  (
    'apex-snack-pro',
    'Apex Snack Pro',
    'AS-500',
    'High-capacity snack machine — 45 selections, guaranteed-drop delivery.',
    'The Apex Snack Pro is a 45-selection snack machine with guaranteed-vend delivery and cashless payment. Great for break rooms and smaller locations where drinks are already available.',
    395000,
    15000,
    'snack',
    ARRAY[
      '45 snack selections',
      'Guaranteed-vend delivery system',
      'Cashless card reader',
      'Low-power standby mode'
    ],
    2
  ),
  (
    'apex-beverage-x',
    'Apex Beverage X',
    'AB-900',
    'Premium beverage-only machine with large capacity and illuminated display.',
    'The Apex Beverage X is a high-capacity cold-drink machine with 10 selections, glass-front merchandising, and cashless payment. Built for high-traffic locations that move volume.',
    445000,
    16500,
    'beverage',
    ARRAY[
      'Glass-front merchandising',
      '10 beverage selections',
      'High-capacity cold storage',
      'Cashless card reader',
      'Illuminated front display'
    ],
    3
  ),
  (
    'apex-micro-market',
    'Apex Micro Market',
    'MM-1',
    'Self-checkout micro-market kiosk for large offices and break rooms.',
    'A full self-checkout micro-market solution with open shelving, cooler, and self-service kiosk. Perfect for 150+ employee offices that want a full food service experience without staff.',
    895000,
    33000,
    'micro_market',
    ARRAY[
      'Self-checkout kiosk',
      'Open shelving + cooler',
      'Card + mobile pay',
      'Loss-prevention camera support'
    ],
    4
  )
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
