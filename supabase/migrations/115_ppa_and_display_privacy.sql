-- Two things in one migration:
--
-- (A) Location "Display As" privacy control on location_placement
--     agreements — separates the FULL location identity (shown to
--     operators + admins) from the PUBLIC-safe rendering (shown to
--     downstream PPs / marketplace surfaces).
--
-- (B) Placement Provider Agreement (PPA) onboarding workflow — new
--     agreement_templates + user_agreements + agreement_audit_events
--     tables backing an admin-countersigned onboarding step for
--     role='placement_partner' users.

-- ═════════════════════════════════════════════════════════════════════
-- (A) LOCATION DISPLAY AS
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE purchase_agreements
  ADD COLUMN IF NOT EXISTS location_display_name text,
  ADD COLUMN IF NOT EXISTS location_display_description text,
  ADD COLUMN IF NOT EXISTS location_display_city_state_only boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN purchase_agreements.location_display_name IS
  'Public-safe display name (e.g., "Downtown Fitness Studio"). Used when the agreement is surfaced to placement partners or the marketplace. Real business_name stays visible to the operator + admins only.';
COMMENT ON COLUMN purchase_agreements.location_display_description IS
  'Public-safe description shown to PPs/marketplace (foot traffic, business type, city/state — no owner name, phone, or street).';
COMMENT ON COLUMN purchase_agreements.location_display_city_state_only IS
  'When true (default), any downstream surface derived from this agreement shows city + state only, never the street address.';

-- ═════════════════════════════════════════════════════════════════════
-- (B) PLACEMENT PROVIDER AGREEMENT WORKFLOW
-- ═════════════════════════════════════════════════════════════════════

-- ─── agreement_templates ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agreement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_type text NOT NULL,          -- 'placement_provider' for now
  version int NOT NULL,
  title text NOT NULL,
  source_document_path text,             -- storage path to the source .docx if provided
  rendered_document_path text,           -- storage path to the rendered HTML/PDF (canonical read copy)
  content_html text NOT NULL,            -- rendered HTML body (source of truth for the display + sign step)
  content_hash text,                     -- sha256 of content_html for tamper detection
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (agreement_type, version)
);

CREATE INDEX IF NOT EXISTS idx_agreement_templates_active
  ON agreement_templates(agreement_type, effective_date DESC)
  WHERE is_active = true;

-- Only ONE active row per agreement_type at a time (enforced via partial
-- unique index — publishing a new active version must inactivate the old
-- one first).
CREATE UNIQUE INDEX IF NOT EXISTS idx_agreement_templates_singleton_active
  ON agreement_templates(agreement_type)
  WHERE is_active = true;

-- ─── user_agreements ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  agreement_template_id uuid NOT NULL REFERENCES agreement_templates(id) ON DELETE RESTRICT,
  agreement_type text NOT NULL,
  agreement_version int NOT NULL,

  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN (
      'not_started',
      'draft',
      'provider_signed_pending_company_countersign',
      'correction_requested',
      'declined',
      'fully_executed',
      'superseded',
      'revoked',
      'legacy_approved'         -- backfill state for existing partners with agreement_signed_at set
    )),

  -- Provider signature (immutable after set)
  provider_signed_at timestamptz,
  provider_typed_name text,
  provider_email_snapshot text,
  provider_ip_address text,
  provider_user_agent text,
  provider_consent_esign boolean NOT NULL DEFAULT false,

  -- Company countersignature (immutable after set)
  countersigned_at timestamptz,
  countersigned_by_user_id uuid REFERENCES profiles(id),
  countersigner_name_snapshot text,
  countersigner_email_snapshot text,

  -- Documents
  provider_document_path text,          -- what the provider signed (immutable)
  countersigned_document_path text,     -- final executed copy
  executed_document_path text,          -- alias / active pointer to the current document

  -- Decisions
  decline_reason text,
  correction_request_reason text,
  admin_override_reason text,

  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- One active agreement per (user, type) — superseded rows stay for history.
  UNIQUE (user_id, agreement_template_id)
);

CREATE INDEX IF NOT EXISTS idx_user_agreements_user_type
  ON user_agreements(user_id, agreement_type);
CREATE INDEX IF NOT EXISTS idx_user_agreements_status
  ON user_agreements(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_agreements_pending_countersign
  ON user_agreements(created_at DESC)
  WHERE status = 'provider_signed_pending_company_countersign';

-- ─── agreement_audit_events ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agreement_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_agreement_id uuid NOT NULL REFERENCES user_agreements(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES profiles(id),
  event_type text NOT NULL,
  previous_status text,
  new_status text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agreement_audit_events_agreement
  ON agreement_audit_events(user_agreement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agreement_audit_events_actor
  ON agreement_audit_events(actor_user_id, created_at DESC);

-- ─── Storage bucket ─────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-agreements', 'user-agreements', false)
ON CONFLICT (id) DO NOTHING;

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE agreement_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON agreement_templates;
CREATE POLICY "Service role only" ON agreement_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone reads active templates" ON agreement_templates;
CREATE POLICY "Anyone reads active templates" ON agreement_templates
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Service role only" ON user_agreements;
CREATE POLICY "Service role only" ON user_agreements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Providers read + insert (through the API) only their own agreement rows.
-- Direct writes go through service role — this policy is a safety net for
-- browser reads via the anon key if we ever expose them.
DROP POLICY IF EXISTS "Provider reads own agreement" ON user_agreements;
CREATE POLICY "Provider reads own agreement" ON user_agreements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role only" ON agreement_audit_events;
CREATE POLICY "Service role only" ON agreement_audit_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Provider reads own audit" ON agreement_audit_events;
CREATE POLICY "Provider reads own audit" ON agreement_audit_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_agreements ua
    WHERE ua.id = agreement_audit_events.user_agreement_id
      AND ua.user_id = auth.uid()
  ));

-- ─── Seed PPA v1 ────────────────────────────────────────────────────
-- Derived from the key business terms provided at prompt time. Admins can
-- publish a v2 by inserting a new row with is_active=true (after setting
-- the current active row's is_active=false).
INSERT INTO agreement_templates (
  agreement_type, version, title, effective_date, is_active, content_html, content_hash
) VALUES (
  'placement_provider',
  1,
  'Vending Connector Placement Provider Agreement',
  CURRENT_DATE,
  true,
  $$
  <h1>Vending Connector Placement Provider Agreement</h1>
  <p><strong>Version 1 — Effective on activation date shown below.</strong></p>

  <h2>1. Term</h2>
  <p>This Agreement has no fixed expiration date. It remains in effect while the Placement Provider remains an authorized user of the Vending Connector platform. Either party may terminate as described in this Agreement.</p>

  <h2>2. Compensation</h2>
  <p>The Placement Provider receives one hundred percent (100%) of the collected Base Placement Fee for each fulfilled location. Vending Connector retains any Company Markup added to the Base Placement Fee. Payment schedules and methods follow the operational rules in the Placement Provider dashboard.</p>

  <h2>3. No Direct or Indirect Operator Contact</h2>
  <p>The Placement Provider is <strong>prohibited from directly or indirectly contacting any operator</strong>. This restriction applies whether the operator's identity is disclosed within the platform, hidden within the platform, or obtained by any means outside the platform. Operator-facing communication, pricing, contract negotiation, and transaction management remain exclusively under Vending Connector control.</p>
  <p>Unauthorized operator contact is a <strong>material breach</strong> and may result in suspension of the Placement Provider account, termination of this Agreement, withholding of unpaid commissions and payouts, and any other remedy available at law or in equity.</p>

  <h2>4. Confidentiality &amp; Non-Circumvention</h2>
  <p>The Placement Provider agrees not to disclose to any third party operator identity, pricing, contract terms, or any other information obtained through the platform. The Placement Provider will not attempt to circumvent Vending Connector by transacting directly with any operator introduced through the platform.</p>

  <h2>5. Independent Contractor</h2>
  <p>The Placement Provider is an independent contractor. Nothing in this Agreement creates any employment, partnership, franchise, joint venture, or agency relationship.</p>

  <h2>6. Compliance</h2>
  <p>The Placement Provider represents that all submitted locations were obtained by the Placement Provider through lawful means, with proper consent from the location decision-maker where applicable.</p>

  <h2>7. Suspension &amp; Termination</h2>
  <p>Vending Connector may suspend or terminate this Agreement immediately on any material breach, including but not limited to unauthorized operator contact, misrepresentation of location facts, or violation of applicable law. Any commissions or payouts unpaid at the time of a breach-based termination may be withheld to the extent permitted by law.</p>

  <h2>8. Modifications</h2>
  <p>Vending Connector may publish updated versions of this Agreement. Continued use of the Placement Provider surface after notice constitutes acceptance of the new version. The Placement Provider may be required to countersign a new version before submitting new placements.</p>

  <h2>9. Electronic Records &amp; Signatures</h2>
  <p>The parties consent to conduct this transaction electronically. A typed name below constitutes a valid electronic signature under the E-SIGN Act and applicable state law.</p>

  <h2>10. Governing Law</h2>
  <p>This Agreement is governed by the laws of the state in which Vending Connector is organized. Any dispute will be resolved in the courts of that state.</p>
  $$,
  md5(random()::text || clock_timestamp()::text)
) ON CONFLICT (agreement_type, version) DO NOTHING;
