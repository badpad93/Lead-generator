-- ═════════════════════════════════════════════════════════════════════
-- 145 — Stripe Connect payout rail on top of the existing QB Bill queue
-- ─────────────────────────────────────────────────────────────────────
-- marketplace_payouts (migration 099, sequencing 111) already models the
-- accepted-submission → paid lifecycle via QuickBooks Bills, including
-- the awaiting_collection → queued transition that fires when the
-- operator's balance invoice is paid. This migration adds Stripe
-- Connect as an *additional* rail so PPs whose accounts are onboarded
-- get paid automatically the moment the operator balance clears —
-- instead of admin having to drain QB Bills by hand.
--
-- No columns removed, no status renamed. Existing QB flow keeps
-- working; Stripe release falls back to QB Bill drain when the
-- partner has no connected account or Stripe rejects the transfer.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE public.marketplace_payouts
  ADD COLUMN IF NOT EXISTS stripe_transfer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_group  text,
  ADD COLUMN IF NOT EXISTS stripe_error           text,
  ADD COLUMN IF NOT EXISTS stripe_last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_marketplace_payouts_stripe_transfer
  ON public.marketplace_payouts(stripe_transfer_id);

-- New terminal status: paid via Stripe Connect transfer. Kept
-- distinct from 'paid' (which historically meant QB Bill paid) so
-- reconciliation reports can tell the two rails apart. `paid` still
-- works for the QB Bill path.
ALTER TABLE public.marketplace_payouts
  DROP CONSTRAINT IF EXISTS marketplace_payouts_status_check;

ALTER TABLE public.marketplace_payouts
  ADD CONSTRAINT marketplace_payouts_status_check
  CHECK (status IN (
    'awaiting_collection',
    'queued',
    'sent_to_qb',
    'sent_to_stripe',
    'paid',
    'stripe_paid',
    'failed',
    'cancelled'
  ));

COMMENT ON COLUMN public.marketplace_payouts.stripe_transfer_id IS
  'Stripe Connect transfer id when this payout was pushed via Stripe rails instead of (or in addition to) the QB Bill drain.';
COMMENT ON COLUMN public.marketplace_payouts.stripe_error IS
  'Last error string returned by Stripe. Presence with status=queued means the release attempt failed and the QB Bill fallback should kick in.';
