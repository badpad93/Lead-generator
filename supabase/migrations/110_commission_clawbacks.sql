-- Phase 4 follow-up — commission clawbacks.
--
-- When a payment is refunded/charged back AFTER the associated commission
-- was already paid to the rep, the reversal row is born in
-- 'clawback_pending' status instead of the generic 'reversed'. The
-- underlying paid earn row keeps status='paid' (money did leave the
-- company) — the reversal row is the paper trail that says "we're owed
-- this back."
--
-- Admin outcomes:
--   clawback_collected — recovered (deducted from next payout, invoiced,
--                        or reconciled another way)
--   clawback_waived    — company chose to eat the loss
--
-- Reversals against earn/held rows still use the plain 'reversed' status
-- because no money left the company — it's a clean write-off.

-- Expand the status check to include the three new terminal states.
ALTER TABLE commission_ledger
  DROP CONSTRAINT IF EXISTS commission_ledger_status_check;

ALTER TABLE commission_ledger
  ADD CONSTRAINT commission_ledger_status_check
  CHECK (status IN (
    'pending',
    'held',
    'earned',
    'reversed',
    'paid',
    'cancelled',
    'clawback_pending',
    'clawback_collected',
    'clawback_waived'
  ));

-- Settlement audit columns — only populated for clawback_collected /
-- clawback_waived rows.
ALTER TABLE commission_ledger
  ADD COLUMN IF NOT EXISTS clawback_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS clawback_settled_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS clawback_settlement_note text;

-- Fast lookup for "outstanding clawbacks" dashboards.
CREATE INDEX IF NOT EXISTS idx_commission_ledger_clawback_pending
  ON commission_ledger(user_id, earned_at DESC)
  WHERE status = 'clawback_pending';
