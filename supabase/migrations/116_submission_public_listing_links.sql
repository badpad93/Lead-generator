-- Rejected placement submissions → public marketplace listings.
--
-- When an operator rejects a candidate location a PP submitted, the PP can
-- salvage the work by publishing the location directly to the public
-- marketplace as a user_listings row. We track both sides of the linkage so
-- the submission surface can show "already published" without a duplicate,
-- and admin can trace a listing back to the originating submission.
--
-- Reuses the location-owner verification flow the leads publish pipeline
-- already set up: is_public stays false until the decision maker clicks the
-- verification link.

ALTER TABLE user_listings
  ADD COLUMN IF NOT EXISTS source_submission_id uuid
    REFERENCES placement_submissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_listings_source_submission
  ON user_listings(source_submission_id)
  WHERE source_submission_id IS NOT NULL;

ALTER TABLE placement_submissions
  ADD COLUMN IF NOT EXISTS public_listing_id uuid
    REFERENCES user_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_placement_submissions_public_listing
  ON placement_submissions(public_listing_id)
  WHERE public_listing_id IS NOT NULL;
