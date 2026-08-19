-- ═════════════════════════════════════════════════════════════════════
-- 148 — Contractor onboarding (post-hire 1099 packet flow)
-- ─────────────────────────────────────────────────────────────────────
-- Distinct from the existing candidate_tokens pipeline + its
-- /api/onboarding/candidates surface (which is pre-hire recruiting).
-- This one takes a signed Vice President contractor through their
-- legal packet: contractor
-- info, tax form (W-9 upload), Independent Contractor Agreement,
-- Confidentiality, Sales/CRM Policy, Compensation acknowledgment,
-- Payment setup (via existing Plaid/Dwolla rails), and e-signature.
--
-- Security posture:
--   * Token stored as SHA-256 hash, never raw. Compared with
--     crypto.timingSafeEqual in the verify path.
--   * Documents (W-9, ACH auth, signed packet) live in a NEW private
--     storage bucket contractor-onboarding-documents — no anon SELECT
--     policy, service-role-only. Admin download uses signed URLs.
--   * ACH info collected via Dwolla funding source (Plaid Link IAV) —
--     we store the funding source URL, never raw routing/account
--     numbers.
--   * Completion notifications are hardcoded to three recipients in
--     the app layer, not fanned out via DB role query.
-- ═════════════════════════════════════════════════════════════════════

-- Hire date on the team member profile — used by the invitation
-- email + review page. Nullable so existing profiles don't break.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hire_date date;

-- ═════════════════════════════════════════════════════════════════════
-- 1. contractor_onboarding — one row per invitation / packet
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.contractor_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Team member being onboarded. Nullable — an admin may invite
  -- someone by email before their profile exists; the profile FK
  -- is stamped when the contractor first opens the link (if a
  -- profile with that email is already present) or on completion.
  team_member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  contractor_email text NOT NULL,
  contractor_name text,                    -- prefill from profile if available
  contractor_preferred_name text,
  contractor_business_name text,
  mailing_address text,
  mailing_city text,
  mailing_state text,
  mailing_zip text,
  phone_number text,
  state_of_residence text,
  payee_legal_name text,
  start_date date NOT NULL,

  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN (
      'not_started',
      'sent',
      'opened',
      'in_progress',
      'completed',
      'needs_attention',
      'revoked',
      'expired'
    )),

  -- SHA-256 hash of the raw token. Raw is generated + emailed once
  -- and never persisted.
  token_hash text UNIQUE NOT NULL,
  token_created_at timestamptz NOT NULL DEFAULT now(),
  token_expires_at timestamptz NOT NULL,

  -- Per-step autosave state. Non-sensitive form values only —
  -- W-9/ACH values never live here, they go to dedicated columns
  -- and the private bucket.
  step_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_step int NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 8),

  -- Restricted document storage paths (private bucket)
  w9_storage_path text,
  w9_original_filename text,
  w9_uploaded_at timestamptz,
  packet_pdf_storage_path text,
  payment_record_storage_path text,

  -- Payment info — Dwolla funding source URL only. Raw routing +
  -- account numbers never touch this database.
  dwolla_customer_id text,
  dwolla_funding_source_url text,
  dwolla_verified_at timestamptz,

  -- Compliance versioning: which version of the agreements the
  -- contractor accepted. Bump AGREEMENT_VERSION in code when
  -- terms change; existing rows preserve the version they signed.
  agreement_version text NOT NULL DEFAULT '2026-01-v1',

  -- Reopen / revision — if admin explicitly reopens a completed
  -- packet, a new row is created that references the original.
  revision_of uuid REFERENCES public.contractor_onboarding(id) ON DELETE SET NULL,

  -- Timestamps
  sent_at timestamptz,
  first_opened_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  locked boolean NOT NULL DEFAULT false,

  -- Delivery + resend audit
  send_count int NOT NULL DEFAULT 0,
  last_resent_at timestamptz,
  last_resent_by uuid REFERENCES public.profiles(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id),

  created_by_user_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_onboarding_status
  ON public.contractor_onboarding(status);
CREATE INDEX IF NOT EXISTS idx_contractor_onboarding_team_member
  ON public.contractor_onboarding(team_member_id);
CREATE INDEX IF NOT EXISTS idx_contractor_onboarding_email
  ON public.contractor_onboarding(lower(contractor_email));
CREATE INDEX IF NOT EXISTS idx_contractor_onboarding_expires
  ON public.contractor_onboarding(token_expires_at)
  WHERE status IN ('sent','opened','in_progress');

-- ═════════════════════════════════════════════════════════════════════
-- 2. contractor_onboarding_signatures — audit trail per doc
-- ═════════════════════════════════════════════════════════════════════
-- Records each individually-signed document. The set of documents is
-- fixed in code (Independent Contractor Agreement, Commission
-- Agreement, Confidentiality Agreement, Sales/CRM Policy, Payment
-- Authorization). Rows are immutable after completion — the app
-- refuses INSERT once contractor_onboarding.locked = true.
--
-- Signature audit fields (ip_address, user_agent, document_version)
-- support downstream legal defensibility. Signature data itself is
-- either the typed legal name (signature_type='typed') or a base64
-- PNG from SignatureCanvas (signature_type='drawn').

CREATE TABLE IF NOT EXISTS public.contractor_onboarding_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.contractor_onboarding(id) ON DELETE CASCADE,

  document_key text NOT NULL
    CHECK (document_key IN (
      'independent_contractor_agreement',
      'commission_agreement',
      'confidentiality_agreement',
      'sales_policy',
      'payment_authorization'
    )),
  document_version text NOT NULL,

  signature_type text NOT NULL CHECK (signature_type IN ('typed','drawn')),
  typed_name text,
  signature_data text,                -- base64 PNG for drawn

  ip_address inet,
  user_agent text,
  signed_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (onboarding_id, document_key, document_version)
);

CREATE INDEX IF NOT EXISTS idx_contractor_signatures_onboarding
  ON public.contractor_onboarding_signatures(onboarding_id);

-- ═════════════════════════════════════════════════════════════════════
-- 3. Private storage bucket for onboarding documents
-- ═════════════════════════════════════════════════════════════════════
-- W-9 uploads, generated signed packet PDFs, payment authorization
-- records. Service-role reads/writes only; admin downloads via
-- signed URL. NO anon SELECT policy — this is the core control that
-- separates onboarding docs from the existing public buckets.
INSERT INTO storage.buckets (id, name, public)
VALUES ('contractor-onboarding-documents', 'contractor-onboarding-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- 4. RLS — service role only. All access flows through /api routes
--    that already enforce role checks (getSalesUser + isElevatedRole,
--    or getAdminUserId for admin-only operations).
-- ═════════════════════════════════════════════════════════════════════
ALTER TABLE public.contractor_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_onboarding_signatures ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'contractor_onboarding'
                   AND policyname = 'service_role_contractor_onboarding') THEN
    CREATE POLICY service_role_contractor_onboarding
      ON public.contractor_onboarding FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'contractor_onboarding_signatures'
                   AND policyname = 'service_role_contractor_signatures') THEN
    CREATE POLICY service_role_contractor_signatures
      ON public.contractor_onboarding_signatures FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
