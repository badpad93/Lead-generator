-- Migration 157: Payroll onboarding — schema, private bucket, RLS
--
-- Backs the "Add to Payroll" workflow off the Team page. Data model
-- separates concerns:
--   * payroll_profiles       — one row per team member being onboarded;
--                              holds admin-set job / comp fields, worker
--                              classification, and lifecycle status.
--   * payroll_invitations    — secure token records (hashed only, raw
--                              never persisted). One profile can have
--                              multiple invites (re-sends, revocations).
--   * payroll_encrypted      — key-value store of AES-256-GCM-encrypted
--                              sensitive fields (SSN, TIN, bank details,
--                              W-4 elections). App-level encryption so
--                              service-role queries never surface
--                              plaintext without going through the
--                              decrypt helper.
--   * payroll_audit_events   — every access + change. Never carries a
--                              sensitive field VALUE, only labels.
--
-- Private bucket 'payroll-documents' for any uploads (I-9 supporting
-- docs, bank verification if opted in). Signed URLs only — no public
-- read policy.

-- ─────────────────────────────────────────────────────────────
-- 1. Enums
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payroll_classification') THEN
    CREATE TYPE payroll_classification AS ENUM ('w2_employee', '1099_contractor');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payroll_status') THEN
    CREATE TYPE payroll_status AS ENUM (
      'not_added',
      'invite_ready',
      'invite_sent',
      'in_progress',
      'employee_action_required',
      'admin_review_required',
      'ready_for_quickbooks',
      'payroll_active',
      'update_requested',
      'inactive'
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. payroll_profiles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_profiles (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by_user_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Admin-set (worker cannot change)
  classification            payroll_classification NOT NULL,
  job_title                 text,
  department                text,
  manager_user_id           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  work_location             text,
  employment_status         text, -- full_time | part_time | temporary | other
  hire_date                 date,
  pay_type                  text, -- hourly | salary | commission | hourly_commission | salary_commission | commission_only
  pay_frequency             text, -- weekly | biweekly | semimonthly | monthly
  hourly_rate_cents         integer,
  annual_salary_cents       integer,
  commission_notes          text,
  expected_hours_per_week   numeric,
  overtime_eligible         boolean,
  compensation_notes        text,
  company_entity            text, -- free text; admin picks from configured list

  -- Recipient email override (defaults to profiles.email at send time)
  recipient_email           text,

  -- Lifecycle
  status                    payroll_status NOT NULL DEFAULT 'invite_ready',
  submitted_at              timestamptz,
  admin_reviewed_at         timestamptz,
  admin_reviewed_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ready_for_quickbooks_at   timestamptz,
  payroll_active_at         timestamptz,
  payroll_active_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- I-9 (W-2 only) — separate columns so admin verification is explicit
  i9_status                 text, -- not_started | employee_section_complete | employer_verification_required | complete
  i9_employee_completed_at  timestamptz,
  i9_employer_verified_at   timestamptz,
  i9_employer_verified_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Contractor-only link (1099)
  contractor_agreement_id   uuid, -- references contractor_onboarding.id if that flow was used

  -- Signatures (typed name + timestamp + IP metadata; not the payroll data itself)
  submission_signature_name text,
  submission_signature_at   timestamptz,
  submission_ip             text,
  submission_user_agent     text,

  -- Home vs work state flag for admin review
  home_state                text,
  work_state                text,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_profiles_team_member_key
  ON public.payroll_profiles (team_member_id);

CREATE INDEX IF NOT EXISTS payroll_profiles_status_idx
  ON public.payroll_profiles (status, created_at DESC);

ALTER TABLE public.payroll_profiles ENABLE ROW LEVEL SECURITY;
-- No policies granted — admin API uses service role.

-- ─────────────────────────────────────────────────────────────
-- 3. payroll_invitations (hashed tokens only)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_invitations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES public.payroll_profiles(id) ON DELETE CASCADE,
  token_hash     text NOT NULL,
  expires_at     timestamptz NOT NULL,
  sent_at        timestamptz,
  opened_at      timestamptz,
  used_at        timestamptz,
  revoked_at     timestamptz,
  revoked_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_invitations_hash_idx
  ON public.payroll_invitations (token_hash);
CREATE INDEX IF NOT EXISTS payroll_invitations_profile_idx
  ON public.payroll_invitations (profile_id, created_at DESC);

ALTER TABLE public.payroll_invitations ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 4. payroll_encrypted — field-level AES-256-GCM
-- ─────────────────────────────────────────────────────────────
-- One row per encrypted field. field_key examples:
--   'ssn', 'tin', 'bank.routing', 'bank.account', 'w4.additional_withholding',
--   etc. Ciphertext + IV + auth tag are all base64.
CREATE TABLE IF NOT EXISTS public.payroll_encrypted (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.payroll_profiles(id) ON DELETE CASCADE,
  field_key    text NOT NULL,
  ciphertext   text NOT NULL,
  iv           text NOT NULL,
  auth_tag     text NOT NULL,
  key_version  int NOT NULL DEFAULT 1,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_encrypted_field_key
  ON public.payroll_encrypted (profile_id, field_key);

ALTER TABLE public.payroll_encrypted ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 5. Non-encrypted worker fields
--    (personal info the employee fills in but that isn't secret —
--    name, DOB, address, phone. DOB stored as date since HR needs
--    it plaintext for QB Payroll setup; treat as personal data,
--    admin-visible only.)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_worker_details (
  profile_id            uuid PRIMARY KEY REFERENCES public.payroll_profiles(id) ON DELETE CASCADE,
  legal_first_name      text,
  middle_name           text,
  legal_last_name       text,
  preferred_name        text,
  date_of_birth         date,
  personal_email        text,
  mobile_phone          text,

  address_street        text,
  address_unit          text,
  address_city          text,
  address_state         text,
  address_zip           text,
  address_country       text DEFAULT 'US',

  -- W-4 non-sensitive
  filing_status         text, -- single | mfj | hoh
  multiple_jobs         boolean,
  qualifying_children_amt integer,
  other_dependents_amt  integer,
  other_income_cents    integer,
  deductions_cents      integer,
  exempt                boolean,

  -- Bank non-sensitive
  account_holder_name   text,
  bank_name             text,
  account_type          text, -- checking | savings
  routing_last4         text, -- for display; full routing is encrypted
  account_last4         text, -- for display; full account is encrypted

  -- Sensitive last-4s for display (full values encrypted in payroll_encrypted)
  ssn_last4             text,

  -- 1099 non-sensitive
  business_name         text,
  federal_tax_class     text,
  tin_type              text, -- ssn | ein
  tin_last4             text,

  -- Emergency contact
  emergency_contact_name         text,
  emergency_contact_relationship text,
  emergency_contact_phone        text,
  emergency_contact_email        text,

  -- Draft state — the wizard writes here after every step so save-and-resume works
  last_step_completed   text,
  step_data             jsonb NOT NULL DEFAULT '{}'::jsonb,

  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_worker_details ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 6. Audit log — never carries sensitive VALUES, only field labels + actor
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_audit_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES public.payroll_profiles(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_kind    text NOT NULL, -- 'admin' | 'employee' | 'system' | 'webhook'
  event_type    text NOT NULL, -- 'invite.sent', 'draft.saved', 'submitted', 'sensitive.revealed', etc.
  description   text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb, -- SAFE fields only; NEVER put SSN/bank/tin here
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_audit_profile_idx
  ON public.payroll_audit_events (profile_id, created_at DESC);

ALTER TABLE public.payroll_audit_events ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 7. Private storage bucket (I-9 docs, bank verification uploads)
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('payroll-documents', 'payroll-documents', false)
ON CONFLICT (id) DO NOTHING;

-- No client read policy — signed URLs only via admin API.

NOTIFY pgrst, 'reload schema';
