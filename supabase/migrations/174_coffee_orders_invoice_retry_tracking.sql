-- Coffee invoice retry tracking for the recovery loop.
--
-- The Sep 1 Intuit outage left three coffee_orders rows in
-- awaiting_payment with no qb_invoice_id because createInvoice
-- hung until Vercel killed the function. Migration 173 shipped
-- the checkout-time hardening (bounded timeout + retry
-- idempotency); this migration adds the columns the SWEEP + admin
-- retry paths need to (a) know how many times we've tried a given
-- order and (b) cap runaway retries when Intuit stays down.
--
-- Columns:
--
--   invoice_retry_attempts int NOT NULL DEFAULT 0
--     Total attempts by any retry path (sweep OR admin). Sweep
--     refuses to attempt an order that's already at the cap
--     (INVOICE_RETRY_CAP in code, 6 today). Admin retry bypasses
--     the cap — that's the whole point of a manual override.
--
--   invoice_last_attempt_at timestamptz
--     Set at the START of every retry attempt (whether it
--     succeeds or fails). The sweep filter uses it to space
--     retries out — no order gets a second attempt within
--     INVOICE_RETRY_MIN_GAP_MS (5 min today).
--
--   invoice_retry_failed_reason text
--     Populated on failure with a short human-readable tag
--     (QbTimeoutError, HTTP status, etc.). Cleared on success.
--     Surfaces in the admin coffee orders list so operators can
--     tell "Intuit still down" from "some other bug."
--
-- Idempotent — ADD COLUMN IF NOT EXISTS only.

ALTER TABLE public.coffee_orders
  ADD COLUMN IF NOT EXISTS invoice_retry_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_retry_failed_reason text;

-- Partial index for the sweep query: only rows that could POSSIBLY
-- need retry (awaiting_payment + no qb_invoice_id). Keeps the scan
-- tiny on a table that's mostly historical paid orders.
CREATE INDEX IF NOT EXISTS idx_coffee_orders_needs_invoice_retry
  ON public.coffee_orders(created_at)
  WHERE status = 'awaiting_payment'
    AND qb_invoice_id IS NULL;

COMMENT ON COLUMN public.coffee_orders.invoice_retry_attempts IS
  'How many times the invoice-retry sweep + admin retry have tried to create the QBO invoice for this order. Sweep respects a cap; admin retry does not.';
COMMENT ON COLUMN public.coffee_orders.invoice_last_attempt_at IS
  'Stamped at the start of every retry attempt. Sweep uses this to space retries out and skip orders that were just tried.';
COMMENT ON COLUMN public.coffee_orders.invoice_retry_failed_reason IS
  'Short tag describing the last retry failure (QbTimeoutError, HTTP 401, etc.). Cleared on successful invoice creation.';
