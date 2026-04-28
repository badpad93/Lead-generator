-- In-house agreement system: tracks sent agreements, signatures, and payments
CREATE TABLE public.agreement_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  pipeline_item_id UUID NOT NULL REFERENCES public.pipeline_items(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.pipeline_steps(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.sales_accounts(id) ON DELETE SET NULL,

  -- Recipient
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,

  -- Agreement content
  industry TEXT,
  zip TEXT,
  pricing_score INTEGER,
  pricing_tier INTEGER,
  pricing_price NUMERIC(12,2) NOT NULL,
  pdf_url TEXT,

  -- Status: pending → viewed → signed → paid
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'signed', 'paid', 'expired')),

  -- Signature
  signature_name TEXT,
  signature_ip TEXT,
  signed_at TIMESTAMPTZ,

  -- Stripe
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  paid_at TIMESTAMPTZ,

  -- Full details delivery
  full_details_sent_at TIMESTAMPTZ,
  full_details_pdf_url TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agreement_tokens_token ON public.agreement_tokens(token);
CREATE INDEX idx_agreement_tokens_pipeline_item ON public.agreement_tokens(pipeline_item_id);
CREATE INDEX idx_agreement_tokens_status ON public.agreement_tokens(status);
