-- Marketplace Phase 2.2 — Contracts, submissions, tier bumps.
-- All tables additive. Nothing in phase 2.1 changes.

-- ─── Contracts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,

  -- Tier system: 1 = $400 PP / $500 op, 2 = $750 / $850, 3 = $1200 / $1300.
  -- VC always keeps $100. Tier bumps require admin approval (see
  -- placement_contract_tier_proposals).
  tier int NOT NULL DEFAULT 1 CHECK (tier IN (1, 2, 3)),
  operator_price numeric NOT NULL,
  partner_payout numeric NOT NULL,
  platform_fee numeric NOT NULL DEFAULT 100,

  -- Where + what
  market_state text,
  market_city text,
  machine_type text,
  contract_type text NOT NULL DEFAULT 'multi'
    CHECK (contract_type IN ('single', 'multi', 'city', 'state', 'recurring')),

  -- Volume + timing
  locations_needed int NOT NULL DEFAULT 1,
  locations_filled int NOT NULL DEFAULT 0,
  deadline_at timestamptz,

  -- Origin (nullable — 2.3 will start setting these from purchase agreements)
  source_order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL,
  source_agreement_id uuid REFERENCES purchase_agreements(id) ON DELETE SET NULL,
  operator_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  operator_business_name text,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'in_progress', 'fulfilled', 'expired', 'cancelled')),
  notes text,

  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_status ON placement_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_state ON placement_contracts(market_state);
CREATE INDEX IF NOT EXISTS idx_contracts_city ON placement_contracts(market_city);
CREATE INDEX IF NOT EXISTS idx_contracts_deadline ON placement_contracts(deadline_at);

-- ─── Contract Requirements (soft-filters) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_contract_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES placement_contracts(id) ON DELETE CASCADE,
  industry text,
  min_employees int,
  min_traffic_score int,
  power_required boolean DEFAULT true,
  parking_required boolean DEFAULT false,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_contract_req_contract ON placement_contract_requirements(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_req_industry ON placement_contract_requirements(industry);

-- ─── Tier Bump Proposals (admin-approved) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_contract_tier_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES placement_contracts(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL REFERENCES profiles(id),
  from_tier int NOT NULL,
  to_tier int NOT NULL CHECK (to_tier IN (1, 2, 3)),
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tier_proposals_contract ON placement_contract_tier_proposals(contract_id);
CREATE INDEX IF NOT EXISTS idx_tier_proposals_status ON placement_contract_tier_proposals(status);

-- ─── Contract Acceptances (slot locks) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_contract_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES placement_contracts(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES placement_partners(id) ON DELETE CASCADE,
  company_id uuid REFERENCES placement_companies(id) ON DELETE SET NULL,
  slots_locked int NOT NULL DEFAULT 1,
  accepted_at timestamptz DEFAULT now(),
  released_at timestamptz,
  release_reason text,
  UNIQUE (contract_id, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_acceptances_partner ON placement_contract_acceptances(partner_id);
CREATE INDEX IF NOT EXISTS idx_acceptances_contract ON placement_contract_acceptances(contract_id);

-- ─── Submissions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES placement_contracts(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES placement_partners(id) ON DELETE CASCADE,
  company_id uuid REFERENCES placement_companies(id) ON DELETE SET NULL,

  -- Location profile (what operators eventually see, minus attribution)
  business_name text NOT NULL,
  address text NOT NULL,
  city text,
  state text,
  zip text,
  industry text,
  employees int,
  traffic_score int,
  decision_maker_name text,
  decision_maker_title text,
  decision_maker_email text,
  decision_maker_phone text,
  power_available boolean DEFAULT true,
  parking_available boolean DEFAULT true,
  machine_recommendation text,
  notes text,

  -- Admin review
  admin_status text NOT NULL DEFAULT 'pending'
    CHECK (admin_status IN ('pending', 'approved', 'changes_requested', 'rejected')),
  admin_reviewer_id uuid REFERENCES profiles(id),
  admin_reviewed_at timestamptz,
  admin_review_note text,

  -- Operator review (defaults locked; 2.4 wires this up)
  operator_status text NOT NULL DEFAULT 'pending'
    CHECK (operator_status IN ('pending', 'accepted', 'rejected')),
  operator_reviewer_id uuid REFERENCES profiles(id),
  operator_reviewed_at timestamptz,
  operator_review_note text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submissions_contract ON placement_submissions(contract_id);
CREATE INDEX IF NOT EXISTS idx_submissions_partner ON placement_submissions(partner_id);
CREATE INDEX IF NOT EXISTS idx_submissions_admin_status ON placement_submissions(admin_status);
CREATE INDEX IF NOT EXISTS idx_submissions_operator_status ON placement_submissions(operator_status);

-- ─── Submission Photos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_submission_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES placement_submissions(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text,
  caption text,
  sort_order int DEFAULT 0,
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submission_photos_submission ON placement_submission_photos(submission_id);

-- ─── Submission Activity Log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_submission_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES placement_submissions(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id),
  activity_type text NOT NULL,
  description text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submission_activity_submission ON placement_submission_activity(submission_id);

-- ─── Contract Activity Log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_contract_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES placement_contracts(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id),
  activity_type text NOT NULL,
  description text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_activity_contract ON placement_contract_activity(contract_id);

-- ─── Anonymity views ──────────────────────────────────────────────────────
-- Operators see submission content but never attribution.
CREATE OR REPLACE VIEW operator_visible_submissions AS
SELECT
  s.id,
  s.contract_id,
  s.business_name,
  s.address,
  s.city,
  s.state,
  s.zip,
  s.industry,
  s.employees,
  s.traffic_score,
  s.power_available,
  s.parking_available,
  s.machine_recommendation,
  s.notes,
  s.admin_status,
  s.operator_status,
  s.operator_reviewed_at,
  s.operator_review_note,
  s.created_at,
  c.machine_type,
  c.market_state,
  c.market_city
FROM placement_submissions s
JOIN placement_contracts c ON c.id = s.contract_id
WHERE s.admin_status = 'approved';

-- Partners see contract content but never operator identity.
CREATE OR REPLACE VIEW partner_visible_contracts AS
SELECT
  c.id,
  c.title,
  c.tier,
  c.partner_payout,
  c.market_state,
  c.market_city,
  c.machine_type,
  c.contract_type,
  c.locations_needed,
  c.locations_filled,
  (c.locations_needed - c.locations_filled) AS slots_remaining,
  c.deadline_at,
  c.status,
  c.notes,
  c.created_at
FROM placement_contracts c
WHERE c.status IN ('open', 'in_progress');

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE placement_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_contract_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_contract_tier_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_contract_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_submission_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_submission_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_contract_activity ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'placement_contracts','placement_contract_requirements','placement_contract_tier_proposals',
    'placement_contract_acceptances','placement_submissions','placement_submission_photos',
    'placement_submission_activity','placement_contract_activity'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Service role only" ON %I;', t);
    EXECUTE format('CREATE POLICY "Service role only" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;

-- Submission photos bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('placement-submissions', 'placement-submissions', false)
ON CONFLICT (id) DO NOTHING;
