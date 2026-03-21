-- ============================================================
-- LEAD PURCHASES — idempotent, self-contained migration
-- Combines 003_lead_purchases + 004_post_purchase_fields with
-- safe defaults so it works even if run on a fresh database.
-- ============================================================

-- Ensure the generic set_updated_at helper exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create lead_purchases table
CREATE TABLE IF NOT EXISTS public.lead_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.vending_requests(id) ON DELETE CASCADE,
  stripe_checkout_session_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  buyer_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'completed', 'failed', 'refunded'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, request_id)
);

-- RLS
ALTER TABLE public.lead_purchases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lead_purchases' AND policyname='Users can view own purchases') THEN
    CREATE POLICY "Users can view own purchases"
      ON public.lead_purchases FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_purchases_user ON public.lead_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_purchases_request ON public.lead_purchases(request_id);
CREATE INDEX IF NOT EXISTS idx_lead_purchases_session ON public.lead_purchases(stripe_checkout_session_id);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS set_lead_purchases_updated_at ON public.lead_purchases;
CREATE TRIGGER set_lead_purchases_updated_at
  BEFORE UPDATE ON public.lead_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Post-purchase contact fields on vending_requests
ALTER TABLE public.vending_requests
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS decision_maker_name text;
