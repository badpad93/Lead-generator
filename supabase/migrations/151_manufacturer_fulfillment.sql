-- ═════════════════════════════════════════════════════════════════════
-- 151 — Manufacturer fulfillment + payout tracking on purchases
-- ─────────────────────────────────────────────────────────────────────
-- Adds fulfillment lifecycle + payout tracking directly on
-- machine_listing_purchases. One row per purchase → one payout per
-- purchase, so no parallel table is needed.
--
-- Payout release trigger is two-gate per user direction:
-- customer payment settled AND manufacturer marked shipped.
-- payment_settled_at + shipped_at both non-null → the release
-- helper (src/lib/manufacturerPayouts.ts) fires the Dwolla transfer.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE public.machine_listing_purchases
  -- Fulfillment lifecycle (brief-defined)
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'new'
    CHECK (fulfillment_status IN (
      'new', 'acknowledged', 'processing', 'shipped',
      'delivered', 'cancelled', 'refunded', 'partially_refunded', 'issue'
    )),
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_ship_date date,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS bill_of_lading_storage_path text,
  ADD COLUMN IF NOT EXISTS serial_numbers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fulfillment_notes text,
  ADD COLUMN IF NOT EXISTS issue_reason text,

  -- Payment settlement trigger (set when customer's payment clears
  -- to VC — Stripe webhook, QB webhook, or admin manual mark).
  ADD COLUMN IF NOT EXISTS payment_settled_at timestamptz,

  -- Manufacturer payout tracking (one payout per purchase)
  ADD COLUMN IF NOT EXISTS manufacturer_payout_status text NOT NULL DEFAULT 'pending'
    CHECK (manufacturer_payout_status IN (
      'pending', 'awaiting_gates', 'ready', 'sent_to_dwolla',
      'paid', 'blocked', 'failed', 'cancelled'
    )),
  ADD COLUMN IF NOT EXISTS payout_dwolla_transfer_id text,
  ADD COLUMN IF NOT EXISTS payout_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_error text,
  ADD COLUMN IF NOT EXISTS payout_last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mlp_fulfillment_status
  ON public.machine_listing_purchases(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_mlp_payout_status
  ON public.machine_listing_purchases(manufacturer_payout_status);
CREATE INDEX IF NOT EXISTS idx_mlp_payout_gates
  ON public.machine_listing_purchases(id)
  WHERE payment_settled_at IS NOT NULL AND shipped_at IS NOT NULL
    AND manufacturer_payout_status IN ('pending', 'awaiting_gates', 'ready');

COMMENT ON COLUMN public.machine_listing_purchases.payment_settled_at IS
  'Stamped when the customer payment has actually settled to VC. Two-gate for payout release: this timestamp AND shipped_at both non-null → src/lib/manufacturerPayouts.ts fires the Dwolla transfer.';
COMMENT ON COLUMN public.machine_listing_purchases.manufacturer_payout_status IS
  'pending → awaiting_gates (one gate met) → ready (both met, queued for release) → sent_to_dwolla → paid. blocked/failed on Dwolla rejection with reason in payout_error.';
