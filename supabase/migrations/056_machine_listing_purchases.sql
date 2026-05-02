-- Machine listing purchases: tracks buy-now purchases with pre-purchase form data
CREATE TABLE IF NOT EXISTS public.machine_listing_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_listing_id uuid REFERENCES public.machine_listings(id),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),

  -- Buyer identity
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,

  -- Buyer type
  buyer_type text CHECK (buyer_type IN ('individual_operator', 'business_owner', 'investor')),

  -- Business info
  business_name text,
  llc_status text CHECK (llc_status IN ('yes', 'no', 'in_progress')),

  -- Location status
  location_status text CHECK (location_status IN ('confirmed', 'securing', 'need_help')),

  -- Existing location fields
  location_business_name text,
  location_address text,
  location_city text,
  location_state text,
  location_zip text,
  site_contact_name text,
  site_contact_phone text,
  site_contact_email text,
  placement_type text,

  -- No location fields
  preferred_market text,
  desired_location_type text,
  foot_traffic text CHECK (foot_traffic IN ('low', 'medium', 'high')),

  -- Deployment
  deployment_timeline text CHECK (deployment_timeline IN ('asap', '30_days', '60_90_days', '90_plus_days')),

  -- Site readiness (checkboxes)
  has_power_outlet boolean DEFAULT false,
  has_indoor_placement boolean DEFAULT false,
  has_enough_space boolean DEFAULT false,
  has_delivery_access boolean DEFAULT false,

  -- Connectivity
  connectivity text CHECK (connectivity IN ('wifi', 'no_wifi', 'not_sure')),

  -- Shipping
  shipping_intent text CHECK (shipping_intent IN ('ship_immediately', 'hold_until_secured')),

  -- CRM references
  crm_account_id uuid,
  crm_lead_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mlp_listing ON machine_listing_purchases(machine_listing_id);
CREATE INDEX idx_mlp_email ON machine_listing_purchases(email);
CREATE INDEX idx_mlp_stripe ON machine_listing_purchases(stripe_checkout_session_id);
