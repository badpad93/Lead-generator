-- Marketplace Phases 2.7 + 2.9 combined
-- - SMS notification event type on marketplace_notifications
-- - partner_score + partner_tier + partner_tier_override on placement_partners
-- - completion_rate metric so we can rank partners fairly
-- No new tables — this migration is purely additive columns + CHECK relax.

-- ─── SMS channel ─────────────────────────────────────────────────────────
-- marketplace_notifications gains 'skipped_no_channel' status for SMS events
-- when the recipient has no phone on file.
ALTER TABLE marketplace_notifications
  DROP CONSTRAINT IF EXISTS marketplace_notifications_status_check;

ALTER TABLE marketplace_notifications
  ADD CONSTRAINT marketplace_notifications_status_check
  CHECK (status IN ('sent', 'skipped_preference', 'skipped_rate_limit', 'skipped_no_channel', 'failed'));

-- channel column tags email vs SMS on each row.
ALTER TABLE marketplace_notifications
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'sms'));

CREATE INDEX IF NOT EXISTS idx_notifications_channel ON marketplace_notifications(channel);

-- ─── Partner scoring + tiering (Phase 2.9) ───────────────────────────────
-- score is 0-100. tier is auto-computed on rating/accept/reject; override
-- lets admin pin a partner up or down.
ALTER TABLE placement_partners
  ADD COLUMN IF NOT EXISTS partner_score numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partner_tier text DEFAULT 'bronze'
    CHECK (partner_tier IN ('bronze', 'silver', 'gold')),
  ADD COLUMN IF NOT EXISTS partner_tier_override text
    CHECK (partner_tier_override IS NULL OR partner_tier_override IN ('bronze', 'silver', 'gold')),
  ADD COLUMN IF NOT EXISTS partner_tier_computed_at timestamptz,
  ADD COLUMN IF NOT EXISTS submissions_accepted_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submissions_total_count int DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_partners_score ON placement_partners(partner_score DESC);
CREATE INDEX IF NOT EXISTS idx_partners_tier ON placement_partners(partner_tier);
