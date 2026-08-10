-- Guest checkout — provisional accounts + tokenized claim/tracking
--
-- Enables the "Option B" flow: unauthenticated visitors can complete a
-- checkout, and we auto-provision a profile behind the scenes. They
-- receive a signed magic link to set a password (claim), and a second
-- signed link to view the order without claiming.
--
-- Provisional accounts ARE real profiles with is_provisional=true so
-- every downstream table (coffee_orders.operator_id, workflows.customer_id,
-- sales_accounts.linked_user_id, agreements) works with zero schema
-- changes elsewhere. The flag flips to false the first time the user
-- signs in with their own password.
--
-- Marketing consent is captured on the profile itself so it's audit-safe
-- (with a timestamp) and doesn't need a separate join to check.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_provisional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provisional_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent boolean,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_is_provisional
  ON profiles(is_provisional) WHERE is_provisional = true;

-- Guest checkout sessions
--
-- One row per completed guest checkout. Holds the tokens that let the
-- user (a) set a password to claim their account (password_token) and
-- (b) view order status without claiming (tracking_token). Tokens are
-- opaque high-entropy strings; expiry is enforced at read time.
--
-- provisioned_user_id is the profiles.id we auto-created. Once the user
-- claims, we set claimed_at here and flip profiles.is_provisional=false;
-- the row stays as an audit trail of the anonymous → claimed transition.
CREATE TABLE IF NOT EXISTS guest_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provisioned_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  business_name text,
  contact_name text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL,
  coffee_order_id uuid REFERENCES coffee_orders(id) ON DELETE SET NULL,
  workflow_id uuid REFERENCES workflows(id) ON DELETE SET NULL,
  agreement_id uuid REFERENCES purchase_agreements(id) ON DELETE SET NULL,
  password_token text UNIQUE NOT NULL,
  password_token_expires_at timestamptz NOT NULL,
  password_token_used_at timestamptz,
  tracking_token text UNIQUE NOT NULL,
  tracking_token_expires_at timestamptz NOT NULL,
  marketing_consent boolean NOT NULL DEFAULT true,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_checkout_sessions_email
  ON guest_checkout_sessions(lower(email));
CREATE INDEX IF NOT EXISTS idx_guest_checkout_sessions_user
  ON guest_checkout_sessions(provisioned_user_id);
CREATE INDEX IF NOT EXISTS idx_guest_checkout_sessions_password_token
  ON guest_checkout_sessions(password_token);
CREATE INDEX IF NOT EXISTS idx_guest_checkout_sessions_tracking_token
  ON guest_checkout_sessions(tracking_token);

ALTER TABLE guest_checkout_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'guest_checkout_sessions'
                   AND policyname = 'service_role_guest_checkout_sessions') THEN
    CREATE POLICY service_role_guest_checkout_sessions
      ON guest_checkout_sessions FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
