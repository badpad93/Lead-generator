-- ============================================================================
-- ONE-TIME RECOVERY — Order #108 (UUID c7b55fca-d0a5-4d0d-85fc-068bf544b8cc)
-- ============================================================================
--
--   DO NOT RUN WITHOUT EXPLICIT APPROVAL.
--
-- Order #108 was hard-deleted via DELETE /api/sales/orders/[id] (which had no
-- commercial-history guard before Phase 5C-a9). The delete cascaded away its
-- order_items and order_activity_log (ON DELETE CASCADE) and orphaned both of
-- its purchase_agreements (order_id -> NULL, ON DELETE SET NULL).
--
-- This script reconstructs the sales_orders row with its ORIGINAL UUID and
-- order_number, recreates the six order_items from the strongest surviving
-- commercial source (the replacement agreement's line_items_snapshot), and
-- relinks the agreements. It is wrapped in a single transaction with hard
-- preconditions; ANY mismatch aborts the whole thing with ROLLBACK.
--
-- It deliberately does NOT: create an invoice (Invoice 779 already exists and
-- must not be duplicated), send email, sign anything, trigger fulfillment, or
-- alter payment state. invoice_status is restored to 'sent' precisely so the
-- signing-time invoice idempotency guard (invoiceAlreadyExists) continues to
-- refuse a duplicate invoice.
--
-- Run inside `supabase db` / psql against the production database ONLY after a
-- fresh backup, and review the RAISE NOTICE output before COMMIT.
-- ============================================================================

BEGIN;

-- ---- Preconditions (abort on any mismatch) --------------------------------
DO $$
DECLARE
  v_order_uuid   uuid := 'c7b55fca-d0a5-4d0d-85fc-068bf544b8cc';
  v_repl_uuid    uuid := '9d3b07fd-b620-40cb-87b9-e691abc47372';
  v_repl_total   numeric;
  v_repl_orderid uuid;
BEGIN
  -- NOTE: the cancelled historical agreement's UUID must be re-read from
  -- production before use — the relink of that row is OPTIONAL and is
  -- commented out below. Do not hard-code it here.

  -- 1. The order must NOT already exist (never clobber a live row).
  IF EXISTS (SELECT 1 FROM public.sales_orders WHERE id = v_order_uuid) THEN
    RAISE EXCEPTION 'ABORT: sales_orders % already exists', v_order_uuid;
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_orders WHERE order_number = 108) THEN
    RAISE EXCEPTION 'ABORT: an order_number 108 already exists';
  END IF;

  -- 2. The replacement agreement must still be present, a draft, and orphaned.
  SELECT total_due_prior_to_procurement, order_id
    INTO v_repl_total, v_repl_orderid
    FROM public.purchase_agreements
   WHERE id = v_repl_uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT: replacement agreement % not found', v_repl_uuid;
  END IF;
  IF v_repl_orderid IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: replacement agreement already linked to order %', v_repl_orderid;
  END IF;

  -- 3. Commercial basis must be exactly $46,099.99.
  IF v_repl_total IS DISTINCT FROM 46099.99 THEN
    RAISE EXCEPTION 'ABORT: replacement total % <> 46099.99', v_repl_total;
  END IF;

  RAISE NOTICE 'Preconditions OK — reconstructing order 108 (%).', v_order_uuid;
END $$;

-- ---- 1. Recreate the sales_orders row with the ORIGINAL UUID --------------
-- Recovered fields are from the ticket's live facts; assumptions are flagged.
INSERT INTO public.sales_orders (
  id, order_number, account_id, created_by, assigned_rep_id,
  document_type, order_type,
  total_value, remaining_balance, deposit_amount, deposit_paid,
  payment_status, invoice_status, financial_spine_invoice_id,
  agreement_status, fulfillment_status, order_status,
  is_ten_ten_ten, next_required_action,
  recipient_email, notes, created_at, updated_at
) VALUES (
  'c7b55fca-d0a5-4d0d-85fc-068bf544b8cc',      -- id (original UUID)
  108,                                          -- order_number (original)
  '90a88030-f905-4295-ba61-87e845a1ee9d',       -- account_id (known)
  'cdab3185-5a2d-41d6-bc44-416271a28df0',       -- created_by (from agreements)
  'cdab3185-5a2d-41d6-bc44-416271a28df0',       -- assigned_rep_id (ASSUMED = created_by)
  'order',                                      -- document_type (known)
  'machine_purchase',                           -- order_type (ASSUMED — standard for a machine deal)
  46099.99,                                     -- total_value (known)
  46099.99,                                     -- remaining_balance (known)
  0,                                            -- deposit_amount (ASSUMED — prepaid 10/10/10, no split)
  false,                                        -- deposit_paid (payment_status unpaid)
  'unpaid',                                     -- payment_status (known)
  'sent',                                       -- invoice_status (known — Invoice 779; load-bearing for idempotency)
  NULL,                                         -- financial_spine_invoice_id (known NULL)
  'not_sent',                                   -- agreement_status (desired post-recovery state)
  'pending',                                    -- fulfillment_status (ASSUMED — nothing fulfilled)
  'draft',                                      -- order_status (desired post-recovery state)
  true,                                         -- is_ten_ten_ten (EVIDENCE: 10/10/10 lines + prepaid location treatment)
  'Review and send replacement agreement',      -- next_required_action (desired)
  (SELECT operator_email FROM public.purchase_agreements
     WHERE id = '9d3b07fd-b620-40cb-87b9-e691abc47372'),  -- recipient_email (recovered from agreement)
  'Restored after unintended hard deletion; commercial basis reconstructed from the preserved replacement-agreement snapshot and previously-issued Invoice 779.',
  now(),                                        -- created_at (UNKNOWN original — using now())
  now()
);

-- ---- 2. Recreate the six order_items from the surviving snapshot ----------
-- Column set intentionally minimal; adjust to the live order_items schema.
INSERT INTO public.order_items
  (order_id, item_type, service_name, description, quantity, unit_price, total_price)
VALUES
  ('c7b55fca-d0a5-4d0d-85fc-068bf544b8cc', 'financing',       '10/10/10 Financing',          NULL,                          1,  0,      0),
  ('c7b55fca-d0a5-4d0d-85fc-068bf544b8cc', 'machine_sale',    'VendEra AI Cooler',           NULL,                          10, 3700,   37000),
  ('c7b55fca-d0a5-4d0d-85fc-068bf544b8cc', 'location_services','Location Services 10/10/10', NULL,                          10, 400,    4000),
  ('c7b55fca-d0a5-4d0d-85fc-068bf544b8cc', 'other',           'Vending Machine Freight',     'Freight for machine shipping',10, 500,    5000),
  ('c7b55fca-d0a5-4d0d-85fc-068bf544b8cc', 'coffee_program',  'Flavia C600 Brewer',          NULL,                          1,  0,      0),
  ('c7b55fca-d0a5-4d0d-85fc-068bf544b8cc', 'coffee_program',  'Coffee Machine Freight',      NULL,                          1,  99.99,  99.99);

-- ---- 3. Relink the replacement agreement (draft, unsent) to the order -----
UPDATE public.purchase_agreements
   SET order_id = 'c7b55fca-d0a5-4d0d-85fc-068bf544b8cc', updated_at = now()
 WHERE id = '9d3b07fd-b620-40cb-87b9-e691abc47372'
   AND order_id IS NULL
   AND agreement_status = 'draft';

-- ---- 3b. OPTIONAL — relink the cancelled historical agreement -------------
-- Only if preserving that history against the same order is desired. It stays
-- 'cancelled' (frozen) either way; the sign guards already refuse it. Verify
-- the exact UUID against production before uncommenting.
-- UPDATE public.purchase_agreements
--    SET order_id = 'c7b55fca-d0a5-4d0d-85fc-068bf544b8cc', updated_at = now()
--  WHERE id = '<CANCELLED_AGREEMENT_UUID — re-read from production>'
--    AND order_id IS NULL
--    AND agreement_status = 'cancelled';

-- ---- 4. One explicit recovery audit event (do NOT fabricate history) ------
INSERT INTO public.order_activity_log (order_id, user_id, activity_type, description)
VALUES (
  'c7b55fca-d0a5-4d0d-85fc-068bf544b8cc',
  'cdab3185-5a2d-41d6-bc44-416271a28df0',
  'order_restored',
  'Order restored after unintended hard deletion; commercial basis reconstructed from the preserved replacement-agreement snapshot and previously-issued Invoice 779. No new invoice created; Invoice 779 preserved.'
);

-- ---- Postconditions (abort if the rebuilt order does not reconcile) --------
DO $$
DECLARE
  v_items_total numeric;
  v_order_total numeric;
BEGIN
  SELECT COALESCE(SUM(total_price), 0) INTO v_items_total
    FROM public.order_items WHERE order_id = 'c7b55fca-d0a5-4d0d-85fc-068bf544b8cc';
  SELECT total_value INTO v_order_total
    FROM public.sales_orders WHERE id = 'c7b55fca-d0a5-4d0d-85fc-068bf544b8cc';

  IF v_items_total IS DISTINCT FROM 46099.99 THEN
    RAISE EXCEPTION 'ABORT: reconstructed items total % <> 46099.99', v_items_total;
  END IF;
  IF v_order_total IS DISTINCT FROM v_items_total THEN
    RAISE EXCEPTION 'ABORT: order header % <> items total %', v_order_total, v_items_total;
  END IF;
  RAISE NOTICE 'Postconditions OK — items and header both reconcile to %.', v_items_total;
END $$;

-- Review the NOTICE output above. If everything reconciled:
--   COMMIT;
-- Otherwise:
--   ROLLBACK;
COMMIT;
