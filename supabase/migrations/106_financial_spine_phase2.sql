-- Financial spine — Phase 2: reconciliation exceptions + reminder tracking.
--
-- Adds two small additive tables — no changes to Phase 1 tables. Once these
-- exist, the daily reconciliation cron can file discrepancies and the hourly
-- reminder cron can track when each invoice was last poked so we don't
-- double-email.

CREATE TABLE IF NOT EXISTS payment_reconciliation_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bucket for the queue view
  type text NOT NULL CHECK (type IN (
    'missing_webhook',       -- provider says paid, we have no payment row
    'missing_provider',      -- we have payment row, provider has no matching record
    'amount_mismatch',       -- provider amount != CRM payment amount
    'duplicate_payment',     -- two payment rows for same provider_payment_id
    'orphan_refund',         -- refund exists at provider, we haven't recorded it
    'wrong_invoice_link',    -- payment linked to invoice we can't verify
    'stale_open_invoice',    -- invoice open past due_date with no payment activity
    'other'
  )),

  provider text,             -- 'stripe' | 'quickbooks' | 'paypal' | null
  provider_ref text,         -- provider payment_id / invoice_id / event_id
  crm_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  crm_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  amount_cents bigint,       -- expected or observed amount in the failure

  note text NOT NULL,
  detected_at timestamptz DEFAULT now(),

  resolved_at timestamptz,
  resolved_by uuid REFERENCES profiles(id),
  resolution_note text,
  resolution_action text     -- 'ignored' | 'reconciled' | 'refunded' | 'manual_entry' | 'other'
);

CREATE INDEX IF NOT EXISTS idx_recon_unresolved ON payment_reconciliation_exceptions(detected_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recon_type ON payment_reconciliation_exceptions(type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_recon_provider_ref ON payment_reconciliation_exceptions(provider, provider_ref);

-- Track when each invoice was last poked by the reminder cron so we don't
-- send the same reminder in two consecutive runs (belt+suspenders — audit
-- log dedup also protects us).
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS last_reminder_stage text,   -- 'sent' | 'pre_due_3' | 'due_today' | 'overdue_3' | 'overdue_7' | 'admin_escalation'
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

-- Refunds carry a structured reason so we can slice the queue later. Notes
-- stay free-form on payments.refund_reason (added in migration 105).
-- We keep this as a soft constraint via API — no CHECK here so admin can add
-- new reasons without a schema change if the seven below don't cover a case.

-- RLS
ALTER TABLE payment_reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON payment_reconciliation_exceptions;
CREATE POLICY "Service role only" ON payment_reconciliation_exceptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
