-- 186: operator storefront quotes (tenant-scoped coffee quoting).
--
-- Lets a storefront operator build a quote for a prospective or existing
-- customer at a chosen pricing tier, send it under their brand, and have
-- the selected tier flow into the customer's storefront pricing.
--
-- Reuses the existing pricing model (storefront_tenant_tier_prices +
-- coffee_products) — this migration only adds durable quote storage.
-- Additive only: no existing row is modified. Tables are RLS-enabled with
-- NO broad policies; all access is through authenticated server APIs using
-- the service role (same pattern as the other storefront_* tables). The
-- public customer quote page reads through a narrow token-validated server
-- endpoint, not anonymous RLS.

-- ─── Quote header ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.storefront_quotes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storefront_tenant_id  uuid NOT NULL REFERENCES public.storefront_tenants(id) ON DELETE CASCADE,
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Recipient: an existing enrolled customer OR a not-yet-enrolled prospect.
  customer_profile_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  prospect_email        text,
  prospect_company      text,
  prospect_first_name   text,
  prospect_last_name    text,
  prospect_phone        text,
  notes                 text,

  -- Selected pricing tier (1-3) + a snapshot of its label at send time.
  selected_tier         smallint NOT NULL DEFAULT 1 CHECK (selected_tier BETWEEN 1 AND 3),
  selected_tier_name    text,

  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','sent','viewed','accepted','declined','expired')),

  -- Opaque public token is delivered in the link/email; only its SHA-256
  -- hash is stored so a DB leak can't be used to open quotes.
  public_token_hash     text UNIQUE,

  -- Money snapshot (filled at send; drafts recompute live from current tiers).
  subtotal              numeric(12,2) NOT NULL DEFAULT 0,
  tax                   numeric(12,2) NOT NULL DEFAULT 0,
  shipping              numeric(12,2) NOT NULL DEFAULT 0,
  total                 numeric(12,2) NOT NULL DEFAULT 0,
  -- Internal economics — never exposed to the customer.
  est_cost              numeric(12,2) NOT NULL DEFAULT 0,
  est_gross_profit      numeric(12,2) NOT NULL DEFAULT 0,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  sent_at               timestamptz,
  viewed_at             timestamptz,
  accepted_at           timestamptz,
  declined_at           timestamptz,
  expires_at            timestamptz,

  -- A quote targets exactly one of: an existing customer, or a prospect email.
  CONSTRAINT storefront_quotes_recipient_ck
    CHECK (customer_profile_id IS NOT NULL OR prospect_email IS NOT NULL)
);
ALTER TABLE public.storefront_quotes ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.storefront_quotes IS
  'Operator-built coffee quotes, tenant-scoped. Selected tier flows to the customer on send/enrollment; line prices are snapshotted at send. Server/service-role access only.';

CREATE INDEX IF NOT EXISTS storefront_quotes_tenant_idx
  ON public.storefront_quotes (storefront_tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS storefront_quotes_customer_idx
  ON public.storefront_quotes (storefront_tenant_id, customer_profile_id);
CREATE INDEX IF NOT EXISTS storefront_quotes_prospect_email_idx
  ON public.storefront_quotes (storefront_tenant_id, lower(prospect_email));

-- ─── Quote lines ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.storefront_quote_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id           uuid NOT NULL REFERENCES public.storefront_quotes(id) ON DELETE CASCADE,
  product_id         uuid NOT NULL REFERENCES public.coffee_products(id) ON DELETE RESTRICT,
  product_name       text NOT NULL,
  product_sku        text,
  quantity           integer NOT NULL CHECK (quantity > 0),

  -- The tier price the resolver produced at snapshot time…
  tier_unit_price    numeric(12,2) NOT NULL CHECK (tier_unit_price >= 0),
  -- …and the actually-quoted unit price (may be a one-time override).
  quoted_unit_price  numeric(12,2) NOT NULL CHECK (quoted_unit_price >= 0),
  is_override        boolean NOT NULL DEFAULT false,

  line_total         numeric(12,2) NOT NULL CHECK (line_total >= 0),
  -- Internal only.
  unit_cost          numeric(12,2) NOT NULL DEFAULT 0,

  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.storefront_quote_lines ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.storefront_quote_lines IS
  'Line-item snapshot for a storefront quote: product, qty, tier/quoted unit price, and internal cost. Immutable once its quote is sent.';

CREATE INDEX IF NOT EXISTS storefront_quote_lines_quote_idx
  ON public.storefront_quote_lines (quote_id);
