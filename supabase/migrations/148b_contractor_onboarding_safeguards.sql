-- ═════════════════════════════════════════════════════════════════════
-- 148b — Contractor onboarding safeguards (best applied while empty)
-- ─────────────────────────────────────────────────────────────────────
-- Two defense-in-depth constraints intentionally added AFTER 148 so
-- the initial migration stays focused. Both are safest to apply while
-- contractor_onboarding is empty; once real packets land, a
-- constraint violation would require row cleanup before deploy.
--
--   1. Partial UNIQUE index on active invitations by lowercased
--      email. The app layer already refuses a duplicate active send
--      via /api/admin/contractor-onboarding (409 with existing_id),
--      but that check is TOCTOU-vulnerable under two concurrent
--      admin POSTs. The DB index closes the race — the second
--      insert fails and the API surface returns 409 cleanly instead
--      of stamping two live invitations for the same person.
--
--   2. CHECK constraint on contractor_onboarding.step_data that
--      forbids the JSONB from ever containing PII-shaped keys.
--      step_data is the autosave scratchpad for form field values;
--      real W-9 uploads live in the private bucket at
--      w9_storage_path, and bank credentials never leave Plaid +
--      Dwolla. This constraint hard-stops a future writer from
--      quietly stashing an SSN / account number in the scratchpad
--      where it would leak via any admin JSON dump of the row.
--
-- Idempotent: IF NOT EXISTS on the index, and the constraint is
-- wrapped in a name-existence check.
-- ═════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS ux_contractor_onboarding_active_email
  ON public.contractor_onboarding (lower(contractor_email))
  WHERE status IN ('sent','opened','in_progress');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contractor_onboarding_step_data_no_pii'
  ) THEN
    ALTER TABLE public.contractor_onboarding
      ADD CONSTRAINT contractor_onboarding_step_data_no_pii
      CHECK (
        NOT (step_data ? 'ssn')
        AND NOT (step_data ? 'social_security_number')
        AND NOT (step_data ? 'tin')
        AND NOT (step_data ? 'ein')
        AND NOT (step_data ? 'account_number')
        AND NOT (step_data ? 'routing_number')
        AND NOT (step_data ? 'bank_account')
        AND NOT (step_data ? 'card_number')
      );
  END IF;
END $$;
