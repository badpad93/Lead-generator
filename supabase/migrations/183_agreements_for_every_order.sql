-- 183: every order gets an agreement, and the agreement is derived
-- entirely from the order's line items.
--
-- Until now purchase_agreements existed only for coffee sales and
-- 10/10/10 packages (see orderNeedsAgreement), and the row modelled one
-- fixed shape: N machines at one price, M locations at one fee, freight,
-- storage. Anything else on the order — coolers, financing, coffee,
-- custom lines — had nowhere to go, so it was dropped on the way in and
-- dropped again on the way back out.
--
-- The new contract is: line_items_snapshot is the source of truth, the
-- scalar columns are a derived cache, and NO column may invent a charge
-- the order does not contain. That makes every remaining opinionated
-- default wrong, so they all go to zero.
--
-- Migration 181 already moved freight from $500/$375 to $350 and storage
-- to $0. $350 was still a guess: an order with no freight line was
-- getting $350/machine added to its contract. Freight now comes from a
-- freight line item or it is not charged.

BEGIN;

ALTER TABLE public.purchase_agreements
  ADD COLUMN IF NOT EXISTS include_financing boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.purchase_agreements.include_financing IS
  'Render the financing schedule. Set from the source order — true when a financing line item is present.';

-- No column may invent money. Everything below is populated from the
-- line-item snapshot by src/lib/agreements/sync.ts; the defaults exist
-- only as a safe floor for any other writer.
ALTER TABLE public.purchase_agreements
  ALTER COLUMN standard_freight_rate         SET DEFAULT 0,
  ALTER COLUMN discounted_freight_rate       SET DEFAULT 0,
  ALTER COLUMN freight_per_machine           SET DEFAULT 0,
  ALTER COLUMN freight_total                 SET DEFAULT 0,
  ALTER COLUMN storage_fee_per_machine_month SET DEFAULT 0,
  ALTER COLUMN machine_quantity              SET DEFAULT 0,
  ALTER COLUMN machine_unit_price            SET DEFAULT 0,
  ALTER COLUMN equipment_subtotal            SET DEFAULT 0;

-- Section toggles now describe what was sold rather than defaulting to
-- "a machine sale with locations and freight". A new agreement gets its
-- toggles from the order; these defaults only apply to rows written by
-- something that forgot to set them.
ALTER TABLE public.purchase_agreements
  ALTER COLUMN include_equipment         SET DEFAULT false,
  ALTER COLUMN include_location_services SET DEFAULT false,
  ALTER COLUMN include_shipping_storage  SET DEFAULT false;

-- ── Repair the six drafts that print charges above a $0.00 total ─────
-- These carry equipment_subtotal 3700 / freight 375 (the old hardcoded
-- fallback and the pre-181 column default) with
-- total_due_prior_to_procurement = 0 and no order behind them. They
-- would render a contract showing $4,075 of line items under a
-- "TOTAL DUE PRIOR TO PROCUREMENT: $0.00".
--
-- They are drafts that were never sent, so zeroing the phantom charges
-- is safe; the next agreement generated from a real order repopulates
-- everything from that order's items.
UPDATE public.purchase_agreements
   SET equipment_subtotal   = 0,
       machine_quantity     = 0,
       machine_unit_price   = 0,
       freight_total        = 0,
       freight_per_machine  = 0,
       standard_freight_rate = 0,
       discounted_freight_rate = 0,
       include_equipment        = false,
       include_location_services = false,
       include_shipping_storage  = false,
       updated_at = now()
 WHERE agreement_status = 'draft'
   AND order_id IS NULL
   AND coalesce(total_due_prior_to_procurement, 0) = 0
   AND line_items_snapshot IS NULL
   AND coalesce(agreement_type, '') <> 'location_placement';

-- ── Standing integrity check ─────────────────────────────────────────
-- An agreement whose total disagrees with its own snapshot means some
-- writer bypassed agreementTotals(). Should always be empty.
CREATE OR REPLACE VIEW public.agreement_total_integrity
WITH (security_invoker = true) AS
SELECT a.id AS agreement_id,
       a.agreement_status,
       a.order_id,
       o.order_number,
       a.total_due_prior_to_procurement AS agreement_total,
       round(coalesce((
         SELECT sum((line ->> 'total_price')::numeric)
           FROM jsonb_array_elements(a.line_items_snapshot) AS line
          WHERE coalesce((line ->> 'deferred')::boolean, false) = false
       ), 0), 2) AS snapshot_total,
       jsonb_array_length(coalesce(a.line_items_snapshot, '[]'::jsonb)) AS snapshot_lines
  FROM public.purchase_agreements a
  LEFT JOIN public.sales_orders o ON o.id = a.order_id
 WHERE coalesce(a.agreement_type, '') <> 'location_placement'
   AND a.line_items_snapshot IS NOT NULL
   AND abs(
       coalesce(a.total_due_prior_to_procurement, 0)
       - coalesce((
           SELECT sum((line ->> 'total_price')::numeric)
             FROM jsonb_array_elements(a.line_items_snapshot) AS line
            WHERE coalesce((line ->> 'deferred')::boolean, false) = false
         ), 0)
     ) > 0.01;

COMMENT ON VIEW public.agreement_total_integrity IS
  'Agreements whose total_due_prior_to_procurement disagrees with the sum of their own line_items_snapshot. Should always be empty; a row here means a write path bypassed agreementTotals() in src/lib/pricing/lineItems.ts.';

COMMIT;
