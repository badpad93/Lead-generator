-- ============================================================
-- SIGNED AGREEMENTS — idempotent migration
-- Stores agreement snapshots signed by users during lead purchase.
-- Must be signed BEFORE a purchase can be completed.
-- ============================================================

-- Drop and recreate if schema changed
DROP TABLE IF EXISTS public.signed_agreements;

CREATE TABLE public.signed_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  lead_id uuid REFERENCES public.vending_requests(id) ON DELETE SET NULL,
  purchase_id uuid REFERENCES public.lead_purchases(id) ON DELETE SET NULL,
  agreement_version text NOT NULL DEFAULT 'v1.0',
  agreement_text text NOT NULL,
  accepted_terms boolean NOT NULL DEFAULT false,
  accepted_population_clause boolean NOT NULL DEFAULT false,
  accepted_esign boolean NOT NULL DEFAULT false,
  full_name text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.signed_agreements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='signed_agreements' AND policyname='Users can view own agreements') THEN
    CREATE POLICY "Users can view own agreements"
      ON public.signed_agreements FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='signed_agreements' AND policyname='Users can insert own agreements') THEN
    CREATE POLICY "Users can insert own agreements"
      ON public.signed_agreements FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_signed_agreements_user ON public.signed_agreements(user_id);
CREATE INDEX IF NOT EXISTS idx_signed_agreements_lead ON public.signed_agreements(lead_id);
CREATE INDEX IF NOT EXISTS idx_signed_agreements_purchase ON public.signed_agreements(purchase_id);
