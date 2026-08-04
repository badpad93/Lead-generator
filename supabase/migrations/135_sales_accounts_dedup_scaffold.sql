-- Migration 135: sales_accounts dedup scaffold (NON-UNIQUE indexes)
--
-- Purpose: introduce normalized identity columns + lookup indexes so the
-- app-layer findOrCreateSalesAccount helper can dedup NEW inserts.
-- Existing duplicate rows are left in place — the admin merge UI is the
-- only path that mutates historical customer data.
--
-- IMPORTANT — index uniqueness:
--   We install NON-UNIQUE partial indexes here. Because production
--   already contains many duplicate customer rows for the same real
--   entity (see the trace behind commit b2d2840), a UNIQUE index
--   would fail to build and would abort this migration. The
--   uniqueness guarantee is therefore enforced at the application
--   layer (findOrCreateSalesAccount) until an admin has run the merge
--   UI enough times that no duplicates remain among non-blank rows.
--   At that point a follow-up migration can promote these indexes to
--   UNIQUE partial indexes — the predicates already exclude NULL and
--   blank values so they'll only collide on real dup identity strings.
--
-- Generated columns are STORED so the indexes can use them; the
-- expressions used (LOWER, TRIM, REGEXP_REPLACE) are all IMMUTABLE.

ALTER TABLE public.sales_accounts
  ADD COLUMN IF NOT EXISTS normalized_email text
    GENERATED ALWAYS AS (LOWER(BTRIM(email))) STORED,
  ADD COLUMN IF NOT EXISTS normalized_business_name text
    GENERATED ALWAYS AS (
      LOWER(REGEXP_REPLACE(BTRIM(business_name), '\s+', ' ', 'g'))
    ) STORED,
  ADD COLUMN IF NOT EXISTS normalized_phone text
    GENERATED ALWAYS AS (REGEXP_REPLACE(COALESCE(phone, ''), '\D', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.sales_accounts.normalized_email IS
  'LOWER(TRIM(email)). Populated automatically. Used by findOrCreateSalesAccount + admin duplicate-review to bridge rows with the same customer email regardless of casing/whitespace.';
COMMENT ON COLUMN public.sales_accounts.normalized_business_name IS
  'LOWER(collapsed-whitespace(TRIM(business_name))). Fallback bridge when email is missing.';
COMMENT ON COLUMN public.sales_accounts.normalized_phone IS
  'Digits-only phone. Paired with normalized_business_name as a secondary bridge.';
COMMENT ON COLUMN public.sales_accounts.deleted_at IS
  'Soft-delete flag set when a row is absorbed by an admin-confirmed merge. Rows with this set are hidden from all lookups; the row remains for rollback.';

-- ── Partial NON-UNIQUE indexes ──────────────────────────────────────
-- Predicates exclude blanks so we can promote to UNIQUE later without
-- a data-cleaning step for empty strings.
CREATE INDEX IF NOT EXISTS idx_sales_accounts_normalized_email_lookup
  ON public.sales_accounts (normalized_email)
  WHERE normalized_email IS NOT NULL AND normalized_email <> '' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_accounts_normalized_name_phone_lookup
  ON public.sales_accounts (normalized_business_name, normalized_phone)
  WHERE normalized_business_name IS NOT NULL AND normalized_business_name <> '' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_accounts_deleted_at
  ON public.sales_accounts (deleted_at) WHERE deleted_at IS NULL;
