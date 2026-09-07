-- 188 — Commercial-total integrity observability (read-only views).
--
-- Migrations 182/183 defined order_total_integrity and
-- agreement_total_integrity, but the live database no longer has them
-- (Phase 5C validation). This migration recreates them with
-- CREATE OR REPLACE VIEW so they exist again, and adds an explicit
-- integrity_status column (match / mismatch / not_verifiable) so the
-- team can query counts directly instead of inferring from row presence.
--
-- READ-ONLY: views only. No table is altered, no row is written, no
-- data is backfilled, no trigger is created. Dropping or replacing these
-- views has zero effect on application behavior — nothing in the app
-- reads them; they are pure observability.
--
-- Invariant mirrored (must match src/lib/pricing/lineItems.ts, Phase 1):
--   * Order:      sales_orders.total_value should equal the sum of its
--                 non-deferred order_items.total_price. resyncOrderTotals
--                 writes total_value = orderTotals().upfrontTotal, which
--                 excludes deferred (status='pending_fulfillment') lines,
--                 so the view sums the same non-deferred set. The view
--                 keys off the persisted total_price (the canonical
--                 per-line total lineTotal() returns for populated rows),
--                 so rows whose legacy price and unit_price disagree do
--                 NOT register as drift as long as total_price is correct.
--   * Agreement:  purchase_agreements.total_due_prior_to_procurement
--                 should equal the sum of its non-deferred
--                 line_items_snapshot total_price (agreementTotals()
--                 .totalDuePriorToProcurement). Agreements without a
--                 usable snapshot (legacy, scalar-only) cannot be checked
--                 this way and are reported as 'not_verifiable' rather
--                 than falsely flagged.

CREATE OR REPLACE VIEW public.order_total_integrity
WITH (security_invoker = true) AS
SELECT o.id                                        AS order_id,
       o.order_number,
       o.document_type,
       o.order_status,
       o.total_value                               AS header_total,
       round(coalesce(sum(oi.total_price), 0), 2)  AS line_total,
       round(coalesce(o.total_value, 0) - coalesce(sum(oi.total_price), 0), 2) AS delta,
       count(oi.id)                                AS line_count,
       CASE
         WHEN abs(coalesce(o.total_value, 0) - coalesce(sum(oi.total_price), 0)) <= 0.01
           THEN 'match'
         ELSE 'mismatch'
       END                                         AS integrity_status
  FROM public.sales_orders o
  LEFT JOIN public.order_items oi
         ON oi.order_id = o.id
        AND coalesce(oi.status, '') <> 'pending_fulfillment'
 GROUP BY o.id;

COMMENT ON VIEW public.order_total_integrity IS
  'Read-only observability. Per order: header total_value vs the sum of its non-deferred order_items.total_price, with integrity_status match/mismatch. A mismatch means a write path bypassed src/lib/pricing/lineItems.ts. No app code reads this view.';

CREATE OR REPLACE VIEW public.agreement_total_integrity
WITH (security_invoker = true) AS
SELECT a.id                                        AS agreement_id,
       a.agreement_status,
       a.order_id,
       o.order_number,
       a.total_due_prior_to_procurement            AS agreement_total,
       round(coalesce((
         SELECT sum((line ->> 'total_price')::numeric)
           FROM jsonb_array_elements(a.line_items_snapshot) AS line
          WHERE coalesce((line ->> 'deferred')::boolean, false) = false
       ), 0), 2)                                    AS snapshot_total,
       jsonb_array_length(coalesce(a.line_items_snapshot, '[]'::jsonb)) AS snapshot_lines,
       CASE
         WHEN a.line_items_snapshot IS NULL
           OR jsonb_typeof(a.line_items_snapshot) <> 'array'
           OR jsonb_array_length(a.line_items_snapshot) = 0
           THEN 'not_verifiable'
         WHEN abs(
                coalesce(a.total_due_prior_to_procurement, 0)
                - coalesce((
                    SELECT sum((line ->> 'total_price')::numeric)
                      FROM jsonb_array_elements(a.line_items_snapshot) AS line
                     WHERE coalesce((line ->> 'deferred')::boolean, false) = false
                  ), 0)
              ) <= 0.01
           THEN 'match'
         ELSE 'mismatch'
       END                                          AS integrity_status
  FROM public.purchase_agreements a
  LEFT JOIN public.sales_orders o ON o.id = a.order_id
 WHERE coalesce(a.agreement_type, '') <> 'location_placement';

COMMENT ON VIEW public.agreement_total_integrity IS
  'Read-only observability. Per non-location-placement agreement: total_due_prior_to_procurement vs the sum of its non-deferred line_items_snapshot total_price, with integrity_status match/mismatch/not_verifiable. not_verifiable = no usable snapshot (legacy scalar-only agreement). A mismatch means a write path bypassed agreementTotals() in src/lib/pricing/lineItems.ts. No app code reads this view.';
