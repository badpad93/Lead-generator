-- ============================================================================
-- Generic customer-owned commerce quotes for Vinnie (Phase 2).
-- ============================================================================
-- Forward-only, idempotent. Three new tables, nothing else altered:
--   commerce_quotes            one quote per customer draft/confirmation
--   commerce_quote_lines       immutable item references + server price snapshots
--   commerce_listing_inquiries "Request information" on a marketplace listing
--
-- Security model (both layers are load-bearing):
--   * Postgres grants: anon has nothing; authenticated has SELECT only;
--     every write goes through service-role server routes.
--   * RLS: every authenticated policy checks auth.uid() ownership.
--     `TO authenticated` alone is never sufficient.
-- No cost, commission, margin, payout, routing, supplier, or credential
-- column exists on these tables by design.

CREATE SEQUENCE IF NOT EXISTS public.commerce_quote_number_seq;

CREATE TABLE IF NOT EXISTS public.commerce_quotes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  thread_id                 uuid REFERENCES public.assistant_threads(id) ON DELETE SET NULL,
  quote_number              text NOT NULL UNIQUE
                              DEFAULT ('VQ-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.commerce_quote_number_seq')::text, 4, '0')),
  status                    text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','confirmed','checkout_pending','invoiced','paid','expired','cancelled')),
  currency                  text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  version                   integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  confirmed_version         integer,
  confirmed_at              timestamptz,
  expires_at                timestamptz,
  -- Financing is metadata + an action, never a price line.
  financing_program         text CHECK (financing_program IS NULL OR financing_program IN ('standard','ten_ten_ten')),
  financing_status          text NOT NULL DEFAULT 'none'
                              CHECK (financing_status IN ('none','interested','application_started','application_submitted')),
  financing_application_id  uuid REFERENCES public.financing_applications(id) ON DELETE SET NULL,
  financing_interest_at     timestamptz,
  agreement_state           text NOT NULL DEFAULT 'not_required'
                              CHECK (agreement_state IN ('not_required','required_missing','satisfied')),
  subtotal                  numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_status                text NOT NULL DEFAULT 'pre_tax' CHECK (tax_status IN ('pre_tax','qbo_calculated','exempt')),
  total                     numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  qb_customer_id            text,
  qb_invoice_id             text,
  qb_invoice_doc_number     text,
  qb_invoice_status         text NOT NULL DEFAULT 'none' CHECK (qb_invoice_status IN ('none','created','sent','paid','void')),
  checkout_status           text NOT NULL DEFAULT 'none' CHECK (checkout_status IN ('none','blocked','link_issued','paid','failed')),
  checkout_url              text CHECK (checkout_url IS NULL OR checkout_url ~ '^https://'),
  checkout_idempotency_key  text UNIQUE,
  checkout_started_at       timestamptz,
  checkout_completed_at     timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_quotes_confirmed_ck CHECK (
    (status <> 'confirmed') OR (confirmed_at IS NOT NULL AND expires_at IS NOT NULL AND confirmed_version IS NOT NULL)
  )
);

COMMENT ON TABLE public.commerce_quotes IS
  'Customer-owned Vinnie quote. Prices are server snapshots re-validated before confirmation and checkout; expires seven days after confirmation.';

CREATE INDEX IF NOT EXISTS commerce_quotes_user_status_idx ON public.commerce_quotes (user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS commerce_quotes_qb_invoice_idx ON public.commerce_quotes (qb_invoice_id) WHERE qb_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.commerce_quote_lines (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id                uuid NOT NULL REFERENCES public.commerce_quotes(id) ON DELETE CASCADE,
  source_type             text NOT NULL CHECK (source_type IN ('catalog_item','coffee_product')),
  catalog_item_id         uuid REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  coffee_product_id       uuid REFERENCES public.coffee_products(id) ON DELETE RESTRICT,
  catalog_key             text,
  description             text NOT NULL,
  quantity                integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  unit_price              numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total              numeric(12,2) NOT NULL CHECK (line_total >= 0),
  pricing_basis           text NOT NULL
                            CHECK (pricing_basis IN ('catalog_fixed','catalog_per_location','no_charge','coffee_list','coffee_tier','coffee_storefront')),
  parent_line_id          uuid REFERENCES public.commerce_quote_lines(id) ON DELETE CASCADE,
  is_auto_add_on          boolean NOT NULL DEFAULT false,
  validation_status       text NOT NULL DEFAULT 'valid'
                            CHECK (validation_status IN ('valid','price_changed','inactive','unavailable','requires_agreement','requires_qualification','mapping_missing','tax_unset','location_intake')),
  staff_determination_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  staff_determination_at  timestamptz,
  staff_determination_note text,
  sort_order              integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_quote_lines_catalog_ref_ck CHECK ((source_type = 'catalog_item') = (catalog_item_id IS NOT NULL)),
  CONSTRAINT commerce_quote_lines_coffee_ref_ck  CHECK ((source_type = 'coffee_product') = (coffee_product_id IS NOT NULL)),
  CONSTRAINT commerce_quote_lines_add_on_ck      CHECK (is_auto_add_on = (parent_line_id IS NOT NULL))
);

COMMENT ON TABLE public.commerce_quote_lines IS
  'Quote lines: immutable catalog/product reference, safe description snapshot, server-generated price snapshot, add-on parentage, validation state.';

CREATE INDEX IF NOT EXISTS commerce_quote_lines_quote_idx ON public.commerce_quote_lines (quote_id, sort_order);

CREATE TABLE IF NOT EXISTS public.commerce_listing_inquiries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  machine_listing_id  uuid NOT NULL REFERENCES public.machine_listings(id) ON DELETE CASCADE,
  thread_id           uuid REFERENCES public.assistant_threads(id) ON DELETE SET NULL,
  message             text CHECK (message IS NULL OR char_length(message) <= 2000),
  status              text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commerce_listing_inquiries IS
  'Owner-linked "Request information" on a non-buy-now marketplace listing. Never an order and never a seller price promise.';

CREATE INDEX IF NOT EXISTS commerce_listing_inquiries_user_idx ON public.commerce_listing_inquiries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commerce_listing_inquiries_listing_idx ON public.commerce_listing_inquiries (machine_listing_id, created_at DESC);

-- ─── updated_at ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS commerce_quotes_touch ON public.commerce_quotes;
CREATE TRIGGER commerce_quotes_touch BEFORE UPDATE ON public.commerce_quotes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS commerce_quote_lines_touch ON public.commerce_quote_lines;
CREATE TRIGGER commerce_quote_lines_touch BEFORE UPDATE ON public.commerce_quote_lines FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Grants ─────────────────────────────────────────────────────────────────
REVOKE ALL PRIVILEGES ON TABLE public.commerce_quotes, public.commerce_quote_lines, public.commerce_listing_inquiries FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.commerce_quotes, public.commerce_quote_lines, public.commerce_listing_inquiries FROM authenticated;
GRANT SELECT ON TABLE public.commerce_quotes, public.commerce_quote_lines, public.commerce_listing_inquiries TO authenticated;
REVOKE ALL ON SEQUENCE public.commerce_quote_number_seq FROM anon, authenticated;

-- ─── Row level security ─────────────────────────────────────────────────────
ALTER TABLE public.commerce_quotes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_quote_lines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_listing_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commerce_quotes_service_role ON public.commerce_quotes;
CREATE POLICY commerce_quotes_service_role ON public.commerce_quotes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS commerce_quotes_owner_select ON public.commerce_quotes;
CREATE POLICY commerce_quotes_owner_select ON public.commerce_quotes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS commerce_quote_lines_service_role ON public.commerce_quote_lines;
CREATE POLICY commerce_quote_lines_service_role ON public.commerce_quote_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS commerce_quote_lines_owner_select ON public.commerce_quote_lines;
CREATE POLICY commerce_quote_lines_owner_select ON public.commerce_quote_lines
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.commerce_quotes q WHERE q.id = commerce_quote_lines.quote_id AND q.user_id = auth.uid()));

DROP POLICY IF EXISTS commerce_listing_inquiries_service_role ON public.commerce_listing_inquiries;
CREATE POLICY commerce_listing_inquiries_service_role ON public.commerce_listing_inquiries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS commerce_listing_inquiries_owner_select ON public.commerce_listing_inquiries;
CREATE POLICY commerce_listing_inquiries_owner_select ON public.commerce_listing_inquiries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
