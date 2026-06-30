-- Email/Password Auth + Verification
-- Adds email verification tracking to profiles and a token table for
-- custom verification emails sent via Resend. Existing OAuth users
-- are auto-marked as verified.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- OAuth users come in already verified (Google/Microsoft/Yahoo verified
-- their email). Backfill so existing accounts aren't locked out.
UPDATE profiles
SET email_verified = true,
    email_verified_at = COALESCE(email_verified_at, created_at, now())
WHERE email_verified IS NOT TRUE
  AND id IN (
    SELECT u.id
    FROM auth.users u
    WHERE u.email_confirmed_at IS NOT NULL
       OR (u.raw_user_meta_data->>'provider') IN ('google', 'azure', 'yahoo')
  );

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verif_tokens_hash ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_verif_tokens_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_verif_tokens_email_created ON email_verification_tokens(email, created_at DESC);

ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can access (drop in case re-running)
DROP POLICY IF EXISTS "Service role only" ON email_verification_tokens;
CREATE POLICY "Service role only" ON email_verification_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
