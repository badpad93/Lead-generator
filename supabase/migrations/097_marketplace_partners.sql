-- Marketplace Phase 2.1 — Placement Partner identity, companies, teams, territories, industries.
-- All tables are additive and untouched by the existing CRM / user_listings flows.

-- ─── Role constraint extension ────────────────────────────────────────────
-- Add 'placement_partner' alongside the existing roles.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'operator', 'locator', 'location_manager', 'requestor',
    'admin', 'sales', 'sales_manager', 'director_of_sales', 'market_leader',
    'placement_partner'
  ));

-- ─── Placement Partner (1:1 with profiles.id) ─────────────────────────────
CREATE TABLE IF NOT EXISTS placement_partners (
  id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  partner_type text NOT NULL DEFAULT 'individual'
    CHECK (partner_type IN ('individual', 'company_owner', 'company_manager', 'company_agent')),
  business_name text,
  bio text,
  active boolean DEFAULT true,
  onboarding_complete boolean DEFAULT false,
  identity_verified_at timestamptz,
  w9_uploaded_at timestamptz,
  agreement_signed_at timestamptz,
  bank_verified_at timestamptz,
  rating numeric(3,2),
  acceptance_rate numeric(3,2),
  contracts_completed int DEFAULT 0,
  capacity int DEFAULT 10,
  lifetime_earnings numeric DEFAULT 0,
  pending_earnings numeric DEFAULT 0,
  qb_vendor_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── Placement Companies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  business_name text NOT NULL,
  website text,
  phone text,
  ein text,
  address text,
  city text,
  state text,
  zip text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── Team Membership (Owner → Manager → Agent) ────────────────────────────
CREATE TABLE IF NOT EXISTS placement_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES placement_companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'agent')),
  active boolean DEFAULT true,
  invited_by uuid REFERENCES profiles(id),
  invited_at timestamptz DEFAULT now(),
  joined_at timestamptz,
  UNIQUE (company_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_company ON placement_team_members(company_id);
CREATE INDEX IF NOT EXISTS idx_team_members_profile ON placement_team_members(profile_id);

-- Pending team invites (before the invitee has an account)
CREATE TABLE IF NOT EXISTS placement_team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES placement_companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'agent')),
  invited_by uuid REFERENCES profiles(id),
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invites_token ON placement_team_invites(token);
CREATE INDEX IF NOT EXISTS idx_team_invites_email ON placement_team_invites(email);

-- ─── Territories (states, cities, radius) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('partner', 'company')),
  owner_id uuid NOT NULL,
  state text,
  city text,
  travel_radius_miles int,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_territories_owner ON placement_territories(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_territories_state ON placement_territories(state);

-- ─── Industries (many-to-many) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_industries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('partner', 'company')),
  owner_id uuid NOT NULL,
  industry text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (owner_type, owner_id, industry)
);

CREATE INDEX IF NOT EXISTS idx_industries_owner ON placement_industries(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_industries_industry ON placement_industries(industry);

-- ─── Documents (W9, IDs, insurance) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_partner_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES placement_partners(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('w9', 'id', 'insurance', 'other')),
  file_url text NOT NULL,
  file_name text,
  uploaded_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_partner_docs_partner ON placement_partner_documents(partner_id);

-- ─── Bank Accounts (only reference IDs; no raw account data) ──────────────
CREATE TABLE IF NOT EXISTS placement_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES placement_partners(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'ach' CHECK (method IN ('ach', 'manual_check')),
  bank_name text,
  account_holder text,
  routing_last4 text,
  account_last4 text,
  verified_at timestamptz,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_partner ON placement_bank_accounts(partner_id);

-- ─── Activity Log (audit trail) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_partner_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES placement_partners(id) ON DELETE CASCADE,
  company_id uuid REFERENCES placement_companies(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id),
  activity_type text NOT NULL,
  description text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_activity_partner ON placement_partner_activity(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_activity_company ON placement_partner_activity(company_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE placement_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_partner_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_partner_activity ENABLE ROW LEVEL SECURITY;

-- Service role has full access on all tables (server APIs use supabaseAdmin).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'placement_partners','placement_companies','placement_team_members',
    'placement_team_invites','placement_territories','placement_industries',
    'placement_partner_documents','placement_bank_accounts','placement_partner_activity'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Service role only" ON %I;', t);
    EXECUTE format('CREATE POLICY "Service role only" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;

-- Storage bucket for partner docs (idempotent create)
INSERT INTO storage.buckets (id, name, public)
VALUES ('placement-partner-docs', 'placement-partner-docs', false)
ON CONFLICT (id) DO NOTHING;
