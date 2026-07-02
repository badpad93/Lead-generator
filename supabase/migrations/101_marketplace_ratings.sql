-- Marketplace Phase 2.5 — Bidirectional ratings + operator rating aggregates.
--
-- Ratings for PARTNERS are visible to admins + the partner themselves.
-- Ratings for OPERATORS are ADMIN-ONLY (never shown to placement partners).
-- Enforced at the API layer; the raw table stores visibility explicitly so
-- future admin tooling can audit it directly.

CREATE TABLE IF NOT EXISTS placement_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who wrote it
  rater_type text NOT NULL CHECK (rater_type IN ('partner', 'operator')),
  rater_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Who it's about
  ratee_type text NOT NULL CHECK (ratee_type IN ('partner', 'operator')),
  ratee_id uuid NOT NULL,   -- partner_id when ratee_type=partner, profile_id when operator

  -- Context: always tied to a specific accepted submission
  submission_id uuid NOT NULL REFERENCES placement_submissions(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES placement_contracts(id) ON DELETE CASCADE,

  -- Payload
  score int NOT NULL CHECK (score BETWEEN 1 AND 5),
  feedback text,
  tags text[] DEFAULT '{}',

  -- Visibility bucket. Admin-only ratings never leak through partner-facing
  -- APIs. Recorded on write so future re-eval keeps the original intent.
  visibility text NOT NULL DEFAULT 'admin_only'
    CHECK (visibility IN ('admin_only', 'visible_to_ratee')),

  created_at timestamptz DEFAULT now(),

  -- One rating per rater per submission per direction
  UNIQUE (rater_profile_id, submission_id, ratee_type)
);

CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON placement_ratings(ratee_type, ratee_id);
CREATE INDEX IF NOT EXISTS idx_ratings_submission ON placement_ratings(submission_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rater ON placement_ratings(rater_profile_id);

-- Operator aggregate (admin-only surface). Partner aggregate already lives on
-- placement_partners.rating from Phase 2.1.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS operator_marketplace_rating numeric(3,2),
  ADD COLUMN IF NOT EXISTS operator_marketplace_rating_count int DEFAULT 0;

-- Also add a count on placement_partners so we can show "4.6 (12 ratings)".
ALTER TABLE placement_partners
  ADD COLUMN IF NOT EXISTS rating_count int DEFAULT 0;

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE placement_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON placement_ratings;
CREATE POLICY "Service role only" ON placement_ratings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
