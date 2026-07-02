-- Marketplace Phase 2.6 — Email notification audit log + per-user preferences.
--
-- Every marketplace email we send goes through the same pipeline:
--   1. Check the recipient's notification_preferences (JSONB on profiles) —
--      each event type gets an explicit on/off switch. Missing keys = default on.
--   2. Check the audit log to dedup within the event's rate-limit window
--      (currently 15 minutes per recipient per key).
--   3. Send via Resend + insert a marketplace_notifications row for the audit.

CREATE TABLE IF NOT EXISTS marketplace_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  recipient_profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,

  -- Event bucket — one of the well-known strings from marketplaceNotifications.ts
  event_type text NOT NULL,
  -- Machine-friendly dedup key (usually "<event>:<entity_id>:<recipient>")
  dedup_key text,

  subject text,

  -- Best-effort references (set as many as apply)
  contract_id uuid REFERENCES placement_contracts(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES placement_submissions(id) ON DELETE SET NULL,
  payout_id uuid REFERENCES marketplace_payouts(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES marketplace_operator_invoices(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'skipped_preference', 'skipped_rate_limit', 'failed')),
  error text,

  metadata jsonb,
  sent_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_event ON marketplace_notifications(event_type, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON marketplace_notifications(recipient_profile_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_dedup ON marketplace_notifications(dedup_key);

-- Notification preferences on profiles (nullable JSONB defaulting to on).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{}'::jsonb;

-- Also on placement_partners for partner-facing bulk defaults (mirror if we
-- need them independent of profile-level prefs). Nullable — profile takes
-- precedence when non-null.
ALTER TABLE placement_partners
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{}'::jsonb;

-- RLS
ALTER TABLE marketplace_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON marketplace_notifications;
CREATE POLICY "Service role only" ON marketplace_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);
