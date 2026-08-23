-- Migration 156: Send Credentials — audit + presets tables
--
-- Backs the /sales/team "Send Credentials" flow that lets an admin
-- email one-time login credentials to a team member's on-file email.
--
-- CRITICAL: no passwords are ever stored server-side. The admin
-- enters the credentials in the modal, the API sends the email
-- immediately, and only NON-SENSITIVE metadata (recipient, sender,
-- timestamp, list of system NAMES) is persisted to audit.
--
-- Data model
-- ─────────
--   team_credential_email_sends
--     id                uuid PK
--     team_member_id    uuid NOT NULL — recipient profile
--     recipient_email   text NOT NULL — actual send-to (may differ
--                                        from profile.email if the
--                                        admin overrode for this send)
--     sent_by_user_id   uuid NOT NULL — profile of the admin
--     sent_at           timestamptz NOT NULL default now()
--     system_names      text[] NOT NULL — labels only; passwords/
--                                        usernames NEVER stored
--     send_status       text NOT NULL — 'sent' | 'failed'
--     error_message     text          — non-sensitive failure detail
--
--   team_credential_presets
--     id                uuid PK
--     name              text NOT NULL — e.g. "Vending Connector CRM"
--     default_login_url text          — optional
--     created_by        uuid          — admin who created the preset
--     created_at        timestamptz NOT NULL default now()
--
-- All writes gated server-side by the admin route using
-- supabaseAdmin (service-role bypasses RLS). Reads are admin-only
-- via the API. Same pattern as every other admin-managed table.

CREATE TABLE IF NOT EXISTS public.team_credential_email_sends (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_email  text NOT NULL,
  sent_by_user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  system_names     text[] NOT NULL DEFAULT '{}',
  send_status      text NOT NULL DEFAULT 'sent'
                     CHECK (send_status IN ('sent', 'failed')),
  error_message    text
);

CREATE INDEX IF NOT EXISTS team_credential_email_sends_member_idx
  ON public.team_credential_email_sends (team_member_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS team_credential_email_sends_sender_idx
  ON public.team_credential_email_sends (sent_by_user_id, sent_at DESC);

ALTER TABLE public.team_credential_email_sends ENABLE ROW LEVEL SECURITY;
-- No policies granted — writes + reads flow through admin API using
-- the service-role key (bypasses RLS), same pattern as
-- marketing_gondola_images and every other admin-only table.

CREATE TABLE IF NOT EXISTS public.team_credential_presets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  default_login_url text,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_credential_presets_name_key
  ON public.team_credential_presets (lower(name));

ALTER TABLE public.team_credential_presets ENABLE ROW LEVEL SECURITY;

-- Seed the common ones per the spec's suggested list. ON CONFLICT
-- so re-running the migration is a no-op if any of these already
-- exist.
INSERT INTO public.team_credential_presets (name, default_login_url)
VALUES
  ('Vending Connector CRM',   'https://vendingconnector.com/login'),
  ('Company Email',           'https://outlook.office.com'),
  ('Microsoft Teams',         'https://teams.microsoft.com'),
  ('Dialer',                  NULL),
  ('Training Portal',         NULL),
  ('Calendly',                'https://calendly.com'),
  ('VOIP System',             NULL),
  ('Vendor Portal',           NULL)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
