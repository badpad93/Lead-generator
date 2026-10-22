-- Smart-cooler purchase checkout: capture delivery details, delivery/haul-away
-- fees, and an optional coffee-service lead — all billed on one QB invoice.

-- Machine delivery address + options + itemized fees on the purchase record.
ALTER TABLE public.smart_cooler_purchases
  ADD COLUMN IF NOT EXISTS delivery_address   text,
  ADD COLUMN IF NOT EXISTS delivery_city      text,
  ADD COLUMN IF NOT EXISTS delivery_state     text,
  ADD COLUMN IF NOT EXISTS delivery_zip       text,
  ADD COLUMN IF NOT EXISTS white_glove        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS haul_away          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS haul_away_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coffee_requested   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coffee_total_cents integer NOT NULL DEFAULT 0,
  -- Grand total actually invoiced (machine + delivery + haul-away + coffee).
  ADD COLUMN IF NOT EXISTS total_cents        integer;

-- A coffee-service lead attached to a machine purchase. The buyer stays a
-- true guest (no account); this captures the application details, the coffee
-- delivery address, and the items ordered so the team can fulfill + follow up.
CREATE TABLE IF NOT EXISTS public.smart_cooler_coffee_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id   uuid REFERENCES public.smart_cooler_purchases(id) ON DELETE CASCADE,
  business_name text,
  contact_name  text,
  email         text,
  phone         text,
  num_locations text,
  estimated_volume text,
  notes         text,
  delivery_address text,
  delivery_city    text,
  delivery_state   text,
  delivery_zip     text,
  items         jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_cents   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sc_coffee_leads_purchase ON public.smart_cooler_coffee_leads (purchase_id);

-- Service-role only (admin reads/writes via supabaseAdmin); no public policy.
ALTER TABLE public.smart_cooler_coffee_leads ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
