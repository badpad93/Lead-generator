-- 182: give order_items one vocabulary and one place to keep money.
--
-- Two problems, both found by auditing production against the code.
--
-- Problem 1 — two vocabularies for item_type.
--   item_type is free text with no constraint, and two subsystems
--   write different words for the same thing:
--     storefront mirror (src/lib/coffeeCrmMirror.ts) -> 'coffee', 'shipping'
--     CRM order builder (src/app/sales/orders/new)   -> 'coffee_program', 'other'
--   Everything downstream tests for the CRM spelling. orderNeedsAgreement()
--   and the Equipment Loan & Beverage Supply gate both check
--   item_type = 'coffee_program', so 52 mirrored coffee line items across
--   13 orders never qualified for an agreement at all, while a line named
--   "Coffee Machine Freight" that happened to be typed 'coffee_program'
--   did trigger the supply agreement.
--
--   Canonical set after this migration (enforced by CHECK):
--     machine_sale, vendera_ai_cooler, combo_machine,
--     location_services, coffee_program, freight, financing, other
--
-- Problem 2 — money hiding in the legacy `price` column.
--   Migration 009 created order_items.price; migration 082 added
--   unit_price/total_price and kept price "for compatibility". Some rows
--   were then written with price only, leaving unit_price = total_price = 0:
--     order #79 $1,800 | #78 $1,800 | #76 $600 | #90 $200 | #84 $100
--   The order header total_value is correct on those rows, but every
--   downstream sum reads total_price and sees $0 — and because the item
--   add/edit/delete routes recompute total_value as sum(total_price),
--   a single item edit on one of those orders would have zeroed it.
--
--   Backfill reads `price` as a UNIT price (that is how every writer
--   sets it) and rebuilds unit_price/total_price from it.
--
-- Both parts are idempotent and safe to re-run.

BEGIN;

-- ── 1. Normalize the vocabulary ──────────────────────────────────────
UPDATE public.order_items
   SET item_type = CASE lower(btrim(coalesce(item_type, '')))
     WHEN 'coffee'           THEN 'coffee_program'
     WHEN 'coffee_supply'    THEN 'coffee_program'
     WHEN 'brewer'           THEN 'coffee_program'
     WHEN 'shipping'         THEN 'freight'
     WHEN 'delivery'         THEN 'freight'
     WHEN 'machine'          THEN 'machine_sale'
     WHEN 'cooler'           THEN 'vendera_ai_cooler'
     WHEN 'combo'            THEN 'combo_machine'
     WHEN 'location'         THEN 'location_services'
     WHEN 'location_service' THEN 'location_services'
     ELSE lower(btrim(coalesce(item_type, '')))
   END
 WHERE lower(btrim(coalesce(item_type, ''))) IN (
   'coffee','coffee_supply','brewer','shipping','delivery',
   'machine','cooler','combo','location','location_service'
 );

-- Anything still outside the canonical set (including NULL and '')
-- becomes 'other' so the CHECK below can be trusted.
UPDATE public.order_items
   SET item_type = 'other'
 WHERE coalesce(item_type, '') NOT IN (
   'machine_sale','vendera_ai_cooler','combo_machine',
   'location_services','coffee_program','freight','financing','other'
 );

-- Rescue rows that are typed 'other' but are unambiguously freight or
-- location services by name. Restricted to 'other' so a deliberately
-- typed line is never re-typed by its label.
UPDATE public.order_items
   SET item_type = 'freight'
 WHERE item_type = 'other'
   AND service_name ~* '\m(freight|shipping|drayage)\M';

UPDATE public.order_items
   SET item_type = 'location_services'
 WHERE item_type = 'other'
   AND service_name ~* '\mlocation (services?|sourcing|placement|deposit)';

-- Shipping charged against a coffee program is still shipping. Reps
-- and the catalog both type lines like "Coffee Machine Freight" as
-- coffee_program; left alone, one of those drags the Equipment Loan &
-- Beverage Supply Agreement into a contract with no brewer on it, and
-- puts freight in the coffee bucket on the payment summary. Same rule
-- categorize() applies at read time (see PR #710).
UPDATE public.order_items
   SET item_type = 'freight'
 WHERE item_type = 'coffee_program'
   AND service_name ~* '\m(freight|shipping|drayage)\M';

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_item_type_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_item_type_check
  CHECK (item_type IN (
    'machine_sale','vendera_ai_cooler','combo_machine',
    'location_services','coffee_program','freight','financing','other'
  ));
ALTER TABLE public.order_items ALTER COLUMN item_type SET DEFAULT 'other';

-- ── 2. Rebuild money for legacy price-only rows ──────────────────────
UPDATE public.order_items
   SET quantity = 1
 WHERE quantity IS NULL OR quantity < 1;

UPDATE public.order_items
   SET discount_percent = 0
 WHERE discount_percent IS NULL;

-- price-only shape: the amount lives in `price`, unit_price and
-- total_price were never populated.
UPDATE public.order_items
   SET unit_price  = price,
       total_price = round(
         (coalesce(quantity, 1) * price)
         * (1 - coalesce(discount_percent, 0) / 100.0), 2)
 WHERE coalesce(price, 0) > 0
   AND coalesce(unit_price, 0) = 0
   AND coalesce(total_price, 0) = 0;

-- unit price present but the line total was never written.
UPDATE public.order_items
   SET total_price = round(
         (coalesce(quantity, 1) * unit_price)
         * (1 - coalesce(discount_percent, 0) / 100.0), 2)
 WHERE coalesce(unit_price, 0) > 0
   AND total_price IS NULL;

-- keep the legacy column consistent for any reader still on it.
UPDATE public.order_items
   SET price = unit_price
 WHERE coalesce(unit_price, 0) > 0
   AND coalesce(price, 0) = 0;

-- ── 3. Re-sync order headers to their line items ─────────────────────
-- Only for orders that are still open. Paid/completed orders keep the
-- header they were invoiced at; correcting those retroactively would
-- disagree with money already collected. The audit view below surfaces
-- them instead.
WITH sums AS (
  SELECT order_id,
         round(sum(coalesce(total_price, 0)), 2) AS line_sum
    FROM public.order_items
   WHERE coalesce(status, '') <> 'pending_fulfillment'
   GROUP BY order_id
)
UPDATE public.sales_orders o
   SET total_value = s.line_sum,
       remaining_balance = CASE
         WHEN o.deposit_paid THEN greatest(0, s.line_sum - coalesce(o.deposit_amount, 0))
         ELSE s.line_sum
       END,
       updated_at = now()
  FROM sums s
 WHERE s.order_id = o.id
   AND coalesce(o.order_status, '') NOT IN ('paid','completed','cancelled')
   AND abs(coalesce(o.total_value, 0) - s.line_sum) > 0.01;

-- ── 4. Standing integrity check ──────────────────────────────────────
-- So header/line drift is something the team can see rather than
-- something an audit has to rediscover.
CREATE OR REPLACE VIEW public.order_total_integrity
WITH (security_invoker = true) AS
SELECT o.id                                   AS order_id,
       o.order_number,
       o.document_type,
       o.order_status,
       o.total_value                          AS header_total,
       round(coalesce(sum(oi.total_price), 0), 2) AS line_total,
       round(o.total_value - coalesce(sum(oi.total_price), 0), 2) AS delta,
       count(oi.id)                           AS line_count
  FROM public.sales_orders o
  LEFT JOIN public.order_items oi
         ON oi.order_id = o.id
        AND coalesce(oi.status, '') <> 'pending_fulfillment'
 GROUP BY o.id
HAVING abs(o.total_value - coalesce(sum(oi.total_price), 0)) > 0.01;

COMMENT ON VIEW public.order_total_integrity IS
  'Orders whose header total_value disagrees with the sum of their non-deferred line items. Should always be empty; a row here means a write path bypassed src/lib/pricing/lineItems.ts.';

COMMIT;
