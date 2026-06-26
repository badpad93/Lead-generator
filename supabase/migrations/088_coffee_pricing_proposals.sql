-- Coffee Pricing Proposals

ALTER TABLE coffee_products ADD COLUMN IF NOT EXISTS pack_quantity int DEFAULT 1;

CREATE TABLE IF NOT EXISTS coffee_pricing_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES profiles(id),
  proposal_number text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'expired')),
  share_token uuid NOT NULL DEFAULT gen_random_uuid(),

  -- Client info
  client_name text,
  client_company text,
  client_email text,
  client_phone text,

  -- Operator branding (defaults from profile, editable per proposal)
  company_name text,
  company_email text,
  company_phone text,
  company_website text,
  company_address text,
  company_city text,
  company_state text,
  company_zip text,

  -- Totals
  total_cost numeric NOT NULL DEFAULT 0,
  total_retail numeric NOT NULL DEFAULT 0,
  total_profit numeric NOT NULL DEFAULT 0,
  overall_margin numeric NOT NULL DEFAULT 0,

  notes text,
  valid_until timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coffee_pricing_proposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES coffee_pricing_proposals(id) ON DELETE CASCADE,
  product_id uuid REFERENCES coffee_products(id),
  product_name text NOT NULL,
  sku text,
  category text,
  unit text DEFAULT 'each',
  unit_cost numeric NOT NULL DEFAULT 0,
  pack_quantity int NOT NULL DEFAULT 1,
  retail_price numeric NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1,
  cost_subtotal numeric NOT NULL DEFAULT 0,
  retail_subtotal numeric NOT NULL DEFAULT 0,
  profit numeric NOT NULL DEFAULT 0,
  margin_pct numeric NOT NULL DEFAULT 0,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coffee_pricing_proposal_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES coffee_pricing_proposals(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id uuid REFERENCES profiles(id),
  actor_name text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_operator ON coffee_pricing_proposals(operator_id);
CREATE INDEX IF NOT EXISTS idx_proposals_share_token ON coffee_pricing_proposals(share_token);
CREATE INDEX IF NOT EXISTS idx_proposal_items_proposal ON coffee_pricing_proposal_items(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_activity_proposal ON coffee_pricing_proposal_activity_log(proposal_id);
