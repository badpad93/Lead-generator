-- Stripe Connect: add connected account ID + onboarding status to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT false;

-- User-posted marketplace listings (operators + location managers can sell)
CREATE TABLE IF NOT EXISTS user_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  listing_type TEXT NOT NULL CHECK (listing_type IN ('lead', 'location', 'route')),
  price NUMERIC(10,2) NOT NULL CHECK (price >= 100 AND price <= 10000),
  city TEXT,
  state TEXT,
  zip TEXT,
  entity_type TEXT,
  foot_traffic TEXT,
  square_footage TEXT,
  business_type TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'expired', 'removed')),
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purchases of user listings (marketplace transactions)
CREATE TABLE IF NOT EXISTS user_listing_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES user_listings(id),
  buyer_id UUID NOT NULL REFERENCES auth.users(id),
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  seller_payout_cents INTEGER NOT NULL,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_transfer_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_listings_seller ON user_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_user_listings_status ON user_listings(status, is_public);
CREATE INDEX IF NOT EXISTS idx_user_listings_state ON user_listings(state);
CREATE INDEX IF NOT EXISTS idx_user_listing_purchases_buyer ON user_listing_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_user_listing_purchases_seller ON user_listing_purchases(seller_id);
CREATE INDEX IF NOT EXISTS idx_user_listing_purchases_listing ON user_listing_purchases(listing_id);

-- RLS
ALTER TABLE user_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_listing_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read active public listings"
  ON user_listings FOR SELECT
  USING (is_public = true AND status = 'active');

CREATE POLICY "Users can read own listings"
  ON user_listings FOR SELECT
  USING (seller_id = auth.uid());

CREATE POLICY "Users can insert own listings"
  ON user_listings FOR INSERT
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Users can update own listings"
  ON user_listings FOR UPDATE
  USING (seller_id = auth.uid());

CREATE POLICY "Users can read own purchases"
  ON user_listing_purchases FOR SELECT
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Service role bypass (for webhook updates)
CREATE POLICY "Service role full access to user_listings"
  ON user_listings FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to user_listing_purchases"
  ON user_listing_purchases FOR ALL
  USING (true) WITH CHECK (true);
