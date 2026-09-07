-- ============================================================================
-- catalog_items — stable keys, typed commerce metadata, QuickBooks mapping,
-- explicit grants + RLS, and the approved Vinnie offering seed.
-- ============================================================================
-- Forward-only and idempotent. Existing rows keep their id, created_by,
-- name, sku, unit_price, and active flag; this migration only adds columns,
-- constraints, and metadata. Migration 085 created the table; nothing else
-- has altered it since.
--
-- Application code must reference rows by id or catalog_key — never by
-- name or SKU (four approved rows have no SKU).

-- ─── 1. Columns ─────────────────────────────────────────────────────────────
ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS catalog_key           text,
  ADD COLUMN IF NOT EXISTS commerce_kind         text NOT NULL DEFAULT 'informational_only',
  ADD COLUMN IF NOT EXISTS pricing_basis         text NOT NULL DEFAULT 'fixed_unit',
  ADD COLUMN IF NOT EXISTS qb_item_id            text,
  ADD COLUMN IF NOT EXISTS tax_treatment         text NOT NULL DEFAULT 'unset',
  ADD COLUMN IF NOT EXISTS required_agreement    text,
  ADD COLUMN IF NOT EXISTS qualification_program text,
  ADD COLUMN IF NOT EXISTS financing_program     text,
  ADD COLUMN IF NOT EXISTS add_on_parent_key     text,
  ADD COLUMN IF NOT EXISTS equipment_ownership   text,
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz DEFAULT now();

COMMENT ON COLUMN public.catalog_items.catalog_key IS
  'Stable, unique, slug-shaped identifier used by application code. Never renamed once assigned.';
COMMENT ON COLUMN public.catalog_items.commerce_kind IS
  'How Vinnie may transact this row: direct_checkout | deposit_only | qualification_required | application_required | agreement_required | informational_only | conditional_add_on.';
COMMENT ON COLUMN public.catalog_items.pricing_basis IS
  'fixed_unit = unit_price per unit; per_location = unit_price × requested locations; no_charge = $0 catalog charge (financing applications).';
COMMENT ON COLUMN public.catalog_items.qb_item_id IS
  'QuickBooks Online Item id for invoice ItemRef. NULL = not mapped; checkout of a payable line is blocked until set by an administrator.';
COMMENT ON COLUMN public.catalog_items.tax_treatment IS
  'unset = checkout blocked (fail closed); qbo_automated = QuickBooks Automated Sales Tax decides from the mapped Item and customer address; exempt = no tax line.';
COMMENT ON COLUMN public.catalog_items.add_on_parent_key IS
  'For conditional_add_on rows: the catalog_key whose quantity drives this add-on (one add-on unit per parent unit).';
COMMENT ON COLUMN public.catalog_items.equipment_ownership IS
  'company_owned_loan = equipment stays company property under the governing agreement (Flavia C600); sold = title transfers on payment.';

-- ─── 2. Constraints (idempotent) ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_catalog_key_key') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_catalog_key_key UNIQUE (catalog_key);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_catalog_key_format_ck') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_catalog_key_format_ck
      CHECK (catalog_key IS NULL OR catalog_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_commerce_kind_ck') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_commerce_kind_ck
      CHECK (commerce_kind IN ('direct_checkout','deposit_only','qualification_required','application_required','agreement_required','informational_only','conditional_add_on'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_pricing_basis_ck') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_pricing_basis_ck
      CHECK (pricing_basis IN ('fixed_unit','per_location','no_charge'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_tax_treatment_ck') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_tax_treatment_ck
      CHECK (tax_treatment IN ('unset','qbo_automated','exempt'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_required_agreement_ck') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_required_agreement_ck
      CHECK (required_agreement IS NULL OR required_agreement IN ('coffee_supply','machine_purchase'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_qualification_program_ck') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_qualification_program_ck
      CHECK (qualification_program IS NULL OR qualification_program IN ('location_tier','ten_ten_ten'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_financing_program_ck') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_financing_program_ck
      CHECK (financing_program IS NULL OR financing_program IN ('standard','ten_ten_ten'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_equipment_ownership_ck') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_equipment_ownership_ck
      CHECK (equipment_ownership IS NULL OR equipment_ownership IN ('sold','company_owned_loan'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_add_on_parent_fk') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_add_on_parent_fk
      FOREIGN KEY (add_on_parent_key) REFERENCES public.catalog_items(catalog_key) ON DELETE RESTRICT;
  END IF;
  -- Kind ↔ metadata consistency: the checkout rules cannot be half-specified.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_kind_metadata_ck') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_kind_metadata_ck CHECK (
      ((commerce_kind = 'conditional_add_on')      = (add_on_parent_key IS NOT NULL)) AND
      ((commerce_kind = 'agreement_required')      = (required_agreement IS NOT NULL)) AND
      ((commerce_kind = 'qualification_required')  = (qualification_program IS NOT NULL)) AND
      ((commerce_kind = 'application_required')    = (financing_program IS NOT NULL)) AND
      ((commerce_kind = 'application_required')    = (pricing_basis = 'no_charge')) AND
      ((commerce_kind = 'deposit_only')            = (pricing_basis = 'per_location')) AND
      (add_on_parent_key IS NULL OR add_on_parent_key <> catalog_key)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalog_items_active_kind ON public.catalog_items(active, commerce_kind);

-- ─── 3. Grants + RLS ────────────────────────────────────────────────────────
-- catalog_items had no RLS statement at all. Every read and write goes
-- through service-role server routes; browsers never touch the table.
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalog_items FROM anon;
REVOKE ALL ON TABLE public.catalog_items FROM authenticated;
DROP POLICY IF EXISTS catalog_items_service_role ON public.catalog_items;
CREATE POLICY catalog_items_service_role ON public.catalog_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4. Backfill + seed of the approved offerings ───────────────────────────
-- Match existing rows by exact SKU (case-insensitive) where the approved
-- row has a SKU, and by exact trimmed name only for the four rows without
-- one. Any key that matches more than one existing row aborts the whole
-- migration; a matched row keeps its id/price/ownership and gains the key
-- and metadata; an unmatched key is inserted.
DO $$
DECLARE
  r record;
  hits integer;
  approved constant jsonb := '[
    {"key":"financing-10-10-10",        "name":"10/10/10 Financing",          "sku":null,       "price":0.00,    "item_type":"financing",         "kind":"application_required",   "basis":"no_charge",    "tax":"exempt", "agreement":null,               "qualification":null,          "financing":"ten_ten_ten", "parent":null,                  "ownership":null,
     "description":"Apply for the 10/10/10 financing program. No catalog charge to start an application; financing is not free and approval is not guaranteed."},
    {"key":"financing-standard",        "name":"Financing",                    "sku":null,       "price":0.00,    "item_type":"financing",         "kind":"application_required",   "basis":"no_charge",    "tax":"exempt", "agreement":null,               "qualification":null,          "financing":"standard",    "parent":null,                  "ownership":null,
     "description":"Apply for standard equipment financing through the financing page. No catalog charge to start an application; financing is not free and approval is not guaranteed."},
    {"key":"flavia-c600-brewer",        "name":"Flavia C600 Brewer",           "sku":"c6000101", "price":0.00,    "item_type":"coffee_program",    "kind":"agreement_required",     "basis":"fixed_unit",   "tax":"unset",  "agreement":"coffee_supply",    "qualification":null,          "financing":null,          "parent":null,                  "ownership":"company_owned_loan",
     "description":"Commercial single-serve brewer provided on loan to qualifying operators under the Equipment Loan and Beverage Supply Agreement. Ownership does not transfer. Coffee Machine Freight applies per brewer."},
    {"key":"coffee-machine-freight",    "name":"Coffee Machine Freight",       "sku":null,       "price":99.99,   "item_type":"freight",           "kind":"conditional_add_on",     "basis":"fixed_unit",   "tax":"unset",  "agreement":null,               "qualification":null,          "financing":null,          "parent":"flavia-c600-brewer",  "ownership":null,
     "description":"Freight for one coffee brewer. Added automatically, one per brewer."},
    {"key":"location-service-10-10-10", "name":"Location Services 10/10/10",   "sku":"LS101010", "price":400.00,  "item_type":"location_services", "kind":"qualification_required", "basis":"fixed_unit",   "tax":"unset",  "agreement":null,               "qualification":"ten_ten_ten", "financing":null,          "parent":null,                  "ownership":null,
     "description":"Bundled per-location placement price for operators approved for the 10/10/10 program. Requires recorded qualification; not a standalone rate."},
    {"key":"location-service-deposit",  "name":"Location Services Deposit",    "sku":"LS100",    "price":100.00,  "item_type":"location_services", "kind":"deposit_only",           "basis":"per_location", "tax":"unset",  "agreement":null,               "qualification":null,          "financing":null,          "parent":null,                  "ownership":null,
     "description":"Refundable-per-terms deposit of $100 per requested location, credited toward the applicable placement fee."},
    {"key":"location-service-tier-1",   "name":"Location Services Tier 1",     "sku":"101010",   "price":500.00,  "item_type":"location_services", "kind":"qualification_required", "basis":"fixed_unit",   "tax":"unset",  "agreement":null,               "qualification":"location_tier","financing":null,         "parent":null,                  "ownership":null,
     "description":"Per-location placement fee for Basic-tier locations. The location team determines the applicable tier."},
    {"key":"location-service-tier-2",   "name":"Location Services Tier 2",     "sku":"1010102",  "price":800.00,  "item_type":"location_services", "kind":"qualification_required", "basis":"fixed_unit",   "tax":"unset",  "agreement":null,               "qualification":"location_tier","financing":null,         "parent":null,                  "ownership":null,
     "description":"Per-location placement fee for Premium-tier locations. The location team determines the applicable tier."},
    {"key":"location-service-tier-3",   "name":"Location Services Tier 3",     "sku":"1010103",  "price":1200.00, "item_type":"location_services", "kind":"qualification_required", "basis":"fixed_unit",   "tax":"unset",  "agreement":null,               "qualification":"location_tier","financing":null,         "parent":null,                  "ownership":null,
     "description":"Per-location placement fee for Elite-tier locations. The location team determines the applicable tier."},
    {"key":"vendera-ai-cooler",         "name":"VendEra AI Cooler",            "sku":"V000111",  "price":3700.00, "item_type":"vendera_ai_cooler", "kind":"agreement_required",     "basis":"fixed_unit",   "tax":"unset",  "agreement":"machine_purchase", "qualification":null,          "financing":null,          "parent":null,                  "ownership":"sold",
     "description":"AI-powered smart cooler. Requires the machine purchase agreement before checkout. Vending Machine Freight applies per unit."},
    {"key":"vending-machine-freight",   "name":"Vending Machine Freight",      "sku":null,       "price":500.00,  "item_type":"freight",           "kind":"conditional_add_on",     "basis":"fixed_unit",   "tax":"unset",  "agreement":null,               "qualification":null,          "financing":null,          "parent":"vendera-ai-cooler",   "ownership":null,
     "description":"Freight for one VendEra AI Cooler. Added automatically, one per unit. Marketplace listings use their own delivery fee instead."},
    {"key":"website-creation",          "name":"Website Creation",             "sku":"WS0001",   "price":500.00,  "item_type":"other",             "kind":"direct_checkout",        "basis":"fixed_unit",   "tax":"unset",  "agreement":null,               "qualification":null,          "financing":null,          "parent":null,                  "ownership":null,
     "description":"Professional website build for a vending operator, delivered through the guided website intake."}
  ]'::jsonb;
BEGIN
  -- Pass 1: uniqueness assertions before anything is written.
  FOR r IN SELECT * FROM jsonb_to_recordset(approved) AS x(key text, name text, sku text) LOOP
    IF r.sku IS NOT NULL THEN
      SELECT count(*) INTO hits FROM public.catalog_items WHERE lower(sku) = lower(r.sku);
    ELSE
      SELECT count(*) INTO hits FROM public.catalog_items WHERE lower(btrim(name)) = lower(r.name);
    END IF;
    IF hits > 1 THEN
      RAISE EXCEPTION 'catalog_items: approved key % matches % existing rows; resolve the duplicate before migrating', r.key, hits;
    END IF;
    IF EXISTS (SELECT 1 FROM public.catalog_items WHERE catalog_key = r.key
                 AND NOT (CASE WHEN r.sku IS NOT NULL THEN lower(sku) = lower(r.sku) ELSE lower(btrim(name)) = lower(r.name) END)) THEN
      RAISE EXCEPTION 'catalog_items: key % is already assigned to a different row', r.key;
    END IF;
  END LOOP;

  -- Pass 2: backfill matched rows / insert missing ones. Parents first so
  -- add-on foreign keys resolve.
  FOR r IN SELECT * FROM jsonb_to_recordset(approved) AS x(
             key text, name text, sku text, price numeric, item_type text, kind text, basis text, tax text,
             agreement text, qualification text, financing text, parent text, ownership text, description text)
           ORDER BY (parent IS NOT NULL), key LOOP
    IF r.sku IS NOT NULL THEN
      SELECT count(*) INTO hits FROM public.catalog_items WHERE lower(sku) = lower(r.sku);
    ELSE
      SELECT count(*) INTO hits FROM public.catalog_items WHERE lower(btrim(name)) = lower(r.name);
    END IF;

    IF hits = 1 THEN
      UPDATE public.catalog_items SET
        catalog_key = r.key,
        commerce_kind = r.kind,
        pricing_basis = r.basis,
        tax_treatment = CASE WHEN tax_treatment = 'unset' THEN r.tax ELSE tax_treatment END,
        required_agreement = r.agreement,
        qualification_program = r.qualification,
        financing_program = r.financing,
        add_on_parent_key = r.parent,
        equipment_ownership = r.ownership,
        description = COALESCE(description, r.description),
        updated_at = now()
      WHERE (r.sku IS NOT NULL AND lower(sku) = lower(r.sku))
         OR (r.sku IS NULL AND lower(btrim(name)) = lower(r.name));
      -- Price is administrative data: never overwritten, only reported.
      IF EXISTS (SELECT 1 FROM public.catalog_items WHERE catalog_key = r.key AND unit_price <> r.price) THEN
        RAISE NOTICE 'catalog_items: % keeps its existing unit_price (approved list says %)', r.key, r.price;
      END IF;
    ELSE
      INSERT INTO public.catalog_items
        (name, description, item_type, unit_price, sku, active, created_by,
         catalog_key, commerce_kind, pricing_basis, tax_treatment, required_agreement,
         qualification_program, financing_program, add_on_parent_key, equipment_ownership)
      VALUES
        (r.name, r.description, r.item_type, r.price, r.sku, true, NULL,
         r.key, r.kind, r.basis, r.tax, r.agreement,
         r.qualification, r.financing, r.parent, r.ownership);
    END IF;
  END LOOP;

  -- Pass 3: every approved key now exists exactly once.
  SELECT count(*) INTO hits FROM public.catalog_items
   WHERE catalog_key IN (SELECT x.key FROM jsonb_to_recordset(approved) AS x(key text));
  IF hits <> 12 THEN
    RAISE EXCEPTION 'catalog_items: expected 12 approved rows after seeding, found %', hits;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
