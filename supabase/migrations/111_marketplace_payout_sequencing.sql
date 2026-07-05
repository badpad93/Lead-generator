-- Placement fee middleman sequencing.
--
-- Old behavior: on operator accept, we queued BOTH the operator invoice AND
-- the PP payout and pushed both to QuickBooks immediately. That meant the
-- QB Bill (VC → PP) was created before the QB Invoice (VC ← operator)
-- had been paid — VC ate the float.
--
-- New behavior:
--   1. Payout is created in status='awaiting_collection' (held).
--   2. When the operator invoice flips to 'paid' (webhook or manual
--      mark-paid), the paired payout drops to 'queued' and the QB Bill
--      drain picks it up.
--   3. If the contract is `billing_prepaid` (placement fee already
--      collected as part of the machine sale), the operator invoice is
--      SKIPPED entirely and the payout goes straight to 'queued'.

-- ─── Expand payout status check ─────────────────────────────────────────
ALTER TABLE marketplace_payouts
  DROP CONSTRAINT IF EXISTS marketplace_payouts_status_check;

ALTER TABLE marketplace_payouts
  ADD CONSTRAINT marketplace_payouts_status_check
  CHECK (status IN (
    'awaiting_collection',
    'queued',
    'sent_to_qb',
    'paid',
    'failed',
    'cancelled'
  ));

CREATE INDEX IF NOT EXISTS idx_marketplace_payouts_awaiting
  ON marketplace_payouts(submission_id)
  WHERE status = 'awaiting_collection';

-- ─── Prepaid contracts ──────────────────────────────────────────────────
ALTER TABLE placement_contracts
  ADD COLUMN IF NOT EXISTS billing_prepaid boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN placement_contracts.billing_prepaid IS
  'True when the placement fee was already collected as part of the source purchase agreement (or otherwise pre-paid). Suppresses the marketplace_operator_invoices creation on submission accept and drops the payout straight to queued instead of awaiting_collection.';
