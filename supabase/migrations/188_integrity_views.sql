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
-- Invariant measured (compare against src/lib/pricing/lineItems.ts,
-- Phase 1):
--   * Order:      sales_orders.total_value vs the sum of its non-deferred
--                 order_items.total_price. resyncOrderTotals writes
--                 total_value = orderTotals().upfrontTotal, which excludes
--                 deferred (status='pending_fulfillment') lines, so the
--                 view sums the same non-deferred set. The view keys off
--                 the persisted total_price (the canonical per-line total
--                 lineTotal() returns for populated rows), so rows whose
--                 legacy price and unit_price disagree do NOT register as
--                 drift as long as total_price is correct.
--   * Agreement:  purchase_agreements.total_due_prior_to_procurement vs
--                 the sum of its non-deferred line_items_snapshot
--                 total_price (agreementTotals().totalDuePriorToProcurement).
--                 Agreements without a usable snapshot (legacy,
--                 scalar-only) cannot be checked this way and are reported
--                 as 'not_verifiable' rather than falsely flagged.
--
-- A 'mismatch' indicates the stored header total diverges from the stored
-- line-item / snapshot total and should be INVESTIGATED. It does NOT by
-- itself prove why: divergence can reflect legacy data, an intentionally
-- frozen/invoiced header, historical manual records, items changed after
-- header creation, an older order representation, an actual bypass of the
-- canonical calculator, or other historical commercial behavior. The view
-- neither mutates data nor determines root cause.

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
  'Read-only observability. Per order: header total_value vs the sum of its non-deferred order_items.total_price, with integrity_status match/mismatch. A mismatch indicates divergence between the stored header total and the stored line-item total and should be investigated; the view does not mutate data or determine root cause. No app code reads this view.';

-- The agreement view guards every JSON array operation behind a LATERAL
-- that only calls jsonb_array_length / jsonb_array_elements when the
-- column is actually a JSON array. NULL, {}, "string", 123, true and []
-- all classify as not_verifiable WITHOUT the query erroring.
CREATE OR REPLACE VIEW public.agreement_total_integrity
WITH (security_invoker = true) AS
SELECT a.id                                        AS agreement_id,
       a.agreement_status,
       a.order_id,
       o.order_number,
       a.total_due_prior_to_procurement            AS agreement_total,
       round(snap.snapshot_total, 2)               AS snapshot_total,
       snap.snapshot_lines                         AS snapshot_lines,
       CASE
         WHEN NOT snap.is_array OR snap.snapshot_lines = 0 THEN 'not_verifiable'
         WHEN abs(coalesce(a.total_due_prior_to_procurement, 0) - snap.snapshot_total) <= 0.01
           THEN 'match'
         ELSE 'mismatch'
       END                                          AS integrity_status
  FROM public.purchase_agreements a
  LEFT JOIN public.sales_orders o ON o.id = a.order_id
  LEFT JOIN LATERAL (
    SELECT
      (jsonb_typeof(a.line_items_snapshot) = 'array') AS is_array,
      CASE WHEN jsonb_typeof(a.line_items_snapshot) = 'array'
           THEN jsonb_array_length(a.line_items_snapshot)
           ELSE 0 END AS snapshot_lines,
      CASE WHEN jsonb_typeof(a.line_items_snapshot) = 'array'
           THEN coalesce((
             SELECT sum((line ->> 'total_price')::numeric)
               FROM jsonb_array_elements(a.line_items_snapshot) AS line
              WHERE coalesce((line ->> 'deferred')::boolean, false) = false
           ), 0)
           ELSE 0 END AS snapshot_total
  ) snap ON true
 WHERE coalesce(a.agreement_type, '') <> 'location_placement';

COMMENT ON VIEW public.agreement_total_integrity IS
  'Read-only observability. Per non-location-placement agreement: total_due_prior_to_procurement vs the sum of its non-deferred line_items_snapshot total_price, with integrity_status match/mismatch/not_verifiable. not_verifiable = no usable snapshot (NULL, non-array, or empty; legacy scalar-only agreements). A mismatch indicates divergence between the stored header total and the stored snapshot total and should be investigated; the view does not mutate data or determine root cause. No app code reads this view.';
