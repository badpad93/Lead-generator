-- ───────────────────────────────────────────────────────────────────────────
-- Migration 127 — Customer-decision loop for location services
--
-- Adds:
--   * workflow_customer_approvals — one row per placement_submission that
--     the customer needs to accept or decline. Location details are
--     snapshotted so the customer sees address/city/state without needing
--     access to the placement_submissions row directly.
--   * workflows.decline_budget_used — running counter enforced by the
--     approval service; hard-capped at quantity_purchased so the customer
--     gets at most 1 decline per purchased location.
--   * workflows.deposit_paid_cents / total_due_cents — surfaces the
--     "paid $100 deposit, $Y remaining" state on the customer detail
--     page and gates the pay-balance flow.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── workflow_customer_approvals ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_customer_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,

  -- Link back to the source PP submission. Nullable so admin-manual
  -- presentations (backfill / edge cases) don't require a submission.
  placement_submission_id uuid REFERENCES placement_submissions(id) ON DELETE SET NULL,

  -- Snapshot of what the customer sees + can later reference. Copied at
  -- presentation time so the customer's record survives PP edits or
  -- deletions.
  location_snapshot jsonb NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'withdrawn')),

  decided_at timestamptz,
  decided_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  decline_reason text,

  -- Optional expiry (e.g. auto-accept after 7 days) — service layer
  -- enforces this via cron; nullable when disabled.
  expires_at timestamptz,

  presented_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One approval per (workflow, submission) — same submission can't be
  -- presented twice; if a PP re-submits (unlikely), it's a new record.
  UNIQUE (workflow_id, placement_submission_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_cust_approvals_workflow
  ON workflow_customer_approvals(workflow_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_cust_approvals_submission
  ON workflow_customer_approvals(placement_submission_id);
CREATE INDEX IF NOT EXISTS idx_workflow_cust_approvals_pending
  ON workflow_customer_approvals(workflow_id) WHERE status = 'pending';

-- updated_at trigger — reuse the shared function created in migration 125.
DROP TRIGGER IF EXISTS trg_workflow_customer_approvals_touch ON workflow_customer_approvals;
CREATE TRIGGER trg_workflow_customer_approvals_touch
  BEFORE UPDATE ON workflow_customer_approvals
  FOR EACH ROW EXECUTE FUNCTION workflows_touch_updated_at();

-- ─── Workflow-level decline budget + money state ─────────────────────────
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS decline_budget_used int NOT NULL DEFAULT 0
    CHECK (decline_budget_used >= 0),
  ADD COLUMN IF NOT EXISTS deposit_paid_cents bigint NOT NULL DEFAULT 0
    CHECK (deposit_paid_cents >= 0),
  ADD COLUMN IF NOT EXISTS total_due_cents bigint NOT NULL DEFAULT 0
    CHECK (total_due_cents >= 0);

COMMENT ON COLUMN workflows.decline_budget_used IS
  'Number of customer_approvals set to declined. Service enforces
   decline_budget_used <= quantity_purchased so a customer gets at most
   1 decline per purchased location slot.';
COMMENT ON COLUMN workflows.deposit_paid_cents IS
  'What the customer has already paid (deposit + any partial payments).
   When less than total_due_cents the workflow surfaces the balance and
   a "Pay balance" CTA on the customer detail page.';
COMMENT ON COLUMN workflows.total_due_cents IS
  'Total cost for this workflow. Zero for non-monetary workflows (financing,
   website_build, coffee_service).';

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE workflow_customer_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON workflow_customer_approvals;
CREATE POLICY "Service role full access"
  ON workflow_customer_approvals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Customer reads own approvals" ON workflow_customer_approvals;
CREATE POLICY "Customer reads own approvals"
  ON workflow_customer_approvals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workflows w
      WHERE w.id = workflow_id AND w.customer_id = auth.uid()
    )
  );
-- Customers write via API only (service role); no direct UPDATE policy.
