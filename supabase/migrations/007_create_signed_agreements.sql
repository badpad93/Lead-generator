-- ============================================================
-- SIGNED AGREEMENTS — idempotent migration
-- Stores agreement snapshots signed by users during lead purchase
-- ============================================================

CREATE TABLE IF NOT EXISTS public.signed_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.vending_requests(id) ON DELETE SET NULL,
  purchase_id uuid REFERENCES public.lead_purchases(id) ON DELETE SET NULL,
  agreement_version text NOT NULL DEFAULT '1.0',
  agreement_html text NOT NULL,
  signed_name text NOT NULL,
  signer_email text NOT NULL,
  ip_address text,
  pdf_url text,
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_signed_agreements_user ON public.signed_agreements(user_id);
CREATE INDEX IF NOT EXISTS idx_signed_agreements_lead ON public.signed_agreements(lead_id);
CREATE INDEX IF NOT EXISTS idx_signed_agreements_purchase ON public.signed_agreements(purchase_id);
