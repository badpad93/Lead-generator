-- Add featured column to profiles for operator featured subscription
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Index for sorting featured operators first
CREATE INDEX IF NOT EXISTS idx_profiles_featured ON profiles (featured DESC) WHERE role = 'operator';

-- Enforce max 3 featured operators per state
CREATE OR REPLACE FUNCTION check_featured_operator_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.featured = true AND NEW.role = 'operator' THEN
    IF (
      SELECT count(*)
      FROM profiles
      WHERE role = 'operator'
        AND featured = true
        AND state = NEW.state
        AND id != NEW.id
    ) >= 3 THEN
      RAISE EXCEPTION 'Maximum 3 featured operators per state reached for state %', NEW.state;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_featured_operator_limit ON profiles;
CREATE TRIGGER trg_check_featured_operator_limit
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_featured_operator_limit();
