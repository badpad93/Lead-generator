-- Location pricing tier rework (v2) + 10/10/10 order-level toggle.
--
-- Two related changes ship together because they are two sides of
-- the same product decision:
--
--   1. The customer-facing per-location fee ladder is collapsing
--      from five tiers ($400/$500/$750/$1000/$1200) to three
--      ($500/$800/$1200). The scoring inputs (traffic, hours,
--      machines) stay the same; only the buckets change:
--        old Tier1 ($400) + Tier2 ($500)         -> Basic   $500
--        old Tier3 ($750) + lower Tier4          -> Premium $800
--        old top of Tier4 + Tier5 ($1000/$1200)  -> Elite   $1200
--
--   2. A new order-level flag (sales_orders.is_ten_ten_ten) marks
--      orders on the "10/10/10" prepaid deal — those customers pay
--      a flat $400 per location up front and skip the per-location
--      deposit. When true, downstream flows (deposit invoice,
--      pricing engine) short-circuit accordingly.
--
-- Backfills existing locations.pricing_price + pricing_tier to the
-- new ladder so no row shows a stale price. Uses a WHEN table
-- that keeps score-to-tier assignment stable across code + SQL.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE...WHERE re-runs to
-- no-op after the first run.

-- ─── Step 1: order-level 10/10/10 flag ────────────────────────────
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS is_ten_ten_ten boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sales_orders.is_ten_ten_ten IS
  'Customer took the 10/10/10 prepaid deal. Per-location fee drops to a flat $400 and the standard $100/location deposit invoice is skipped (all funds collected up front).';

-- ─── Step 2: backfill locations.pricing_tier / pricing_price ──────
-- New ladder: <60 = 1 (Basic $500), 60-89 = 2 (Premium $800), 90+ = 3 (Elite $1200).
UPDATE public.locations
   SET pricing_tier = CASE
         WHEN pricing_score >= 90 THEN 3
         WHEN pricing_score >= 60 THEN 2
         ELSE 1
       END,
       pricing_price = CASE
         WHEN pricing_score >= 90 THEN 1200
         WHEN pricing_score >= 60 THEN 800
         ELSE 500
       END
 WHERE pricing_score IS NOT NULL
   AND (
     pricing_price IS DISTINCT FROM CASE
       WHEN pricing_score >= 90 THEN 1200
       WHEN pricing_score >= 60 THEN 800
       ELSE 500
     END
     OR pricing_tier IS DISTINCT FROM CASE
       WHEN pricing_score >= 90 THEN 3
       WHEN pricing_score >= 60 THEN 2
       ELSE 1
     END
   );
