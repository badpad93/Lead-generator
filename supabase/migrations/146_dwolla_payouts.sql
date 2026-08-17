-- ═════════════════════════════════════════════════════════════════════
-- 146 — Dwolla ACH payout rail (Plaid IAV for bank verification)
-- ─────────────────────────────────────────────────────────────────────
-- Placement providers get paid automatically via Dwolla the moment the
-- operator's balance invoice clears. Plaid Link is used solely to
-- verify the PP's bank account and hand Dwolla a processor_token; the
-- Plaid access_token is not persisted (single-use in the exchange
-- endpoint, discarded after we get the Dwolla funding source URL).
--
-- Model:
--   1. PP hits /placement/settings/bank-account, launches Plaid Link.
--   2. Plaid returns a public_token + account_id.
--   3. Our /api/placement/dwolla/exchange endpoint:
--        a. Exchanges public_token → access_token
--        b. Creates a Plaid processor_token for Dwolla
--        c. Creates a Dwolla Receive-Only Customer if the PP doesn't
--           already have one
--        d. POSTs the processor_token to Dwolla to create a verified
--           funding_source on the customer
--        e. Persists dwolla_customer_id + dwolla_funding_source_id +
--           dwolla_verified_at on placement_partners
--   4. When a payout is released, we POST a Dwolla /transfers from our
--      master funding source (env: DWOLLA_MASTER_FUNDING_SOURCE_URL)
--      to the PP's funding source. Transfer id + status stored on
--      marketplace_payouts.
--   5. Dwolla webhook (/api/webhooks/dwolla) flips the payout to
--      'paid' on customer_transfer_completed or 'failed' on
--      cancelled/failed/returned events.
-- ═════════════════════════════════════════════════════════════════════

-- ─── PP bank onboarding fields ──────────────────────────────────────
ALTER TABLE public.placement_partners
  ADD COLUMN IF NOT EXISTS dwolla_customer_id        text,
  ADD COLUMN IF NOT EXISTS dwolla_funding_source_id  text,
  ADD COLUMN IF NOT EXISTS dwolla_verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (dwolla_verification_status IN ('unverified','pending','verified','suspended','deactivated')),
  ADD COLUMN IF NOT EXISTS dwolla_verified_at        timestamptz;

CREATE INDEX IF NOT EXISTS idx_partners_dwolla_customer
  ON public.placement_partners(dwolla_customer_id);

-- ─── Dwolla transfer fields on marketplace_payouts ──────────────────
ALTER TABLE public.marketplace_payouts
  ADD COLUMN IF NOT EXISTS dwolla_transfer_id       text,
  ADD COLUMN IF NOT EXISTS dwolla_transfer_status   text,
  ADD COLUMN IF NOT EXISTS dwolla_error             text,
  ADD COLUMN IF NOT EXISTS dwolla_last_attempt_at   timestamptz;

-- Extend the status check to include the Dwolla lane. sent_to_dwolla
-- means the transfer was accepted by Dwolla and we're waiting on the
-- ACH webhook to flip to 'paid'. Legacy QB Bill lane
-- (queued → sent_to_qb → paid) still works as fallback for PPs who
-- haven't completed Dwolla onboarding.
ALTER TABLE public.marketplace_payouts
  DROP CONSTRAINT IF EXISTS marketplace_payouts_status_check;

ALTER TABLE public.marketplace_payouts
  ADD CONSTRAINT marketplace_payouts_status_check
  CHECK (status IN (
    'awaiting_collection',
    'queued',
    'sent_to_qb',
    'sent_to_dwolla',
    'paid',
    'failed',
    'cancelled'
  ));

CREATE INDEX IF NOT EXISTS idx_marketplace_payouts_dwolla_transfer
  ON public.marketplace_payouts(dwolla_transfer_id);

COMMENT ON COLUMN public.marketplace_payouts.dwolla_transfer_id IS
  'Dwolla /transfers resource id when the payout was released via Dwolla ACH. Absent when the payout went through the QB Bill fallback path.';
COMMENT ON COLUMN public.marketplace_payouts.dwolla_error IS
  'Last error string returned by Dwolla during release. Populated with the reason if release fell back to QB Bill.';
