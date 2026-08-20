-- ═════════════════════════════════════════════════════════════════════
-- 148c — Deeper step_data PII guard on contractor_onboarding
-- ─────────────────────────────────────────────────────────────────────
-- 148b installed a shallow CHECK using the JSONB `?` operator, which
-- only matches TOP-LEVEL exact snake_case keys. Real gaps flagged
-- during review:
--
--   * camelCase — 'socialSecurityNumber', 'bankAccount', 'cardNumber'
--   * ALL CAPS  — 'SSN', 'EIN'
--   * Substrings — 'my_ssn', 'contractor_ssn', 'ssn_last_4'
--   * Nested objects — {"personal": {"ssn": "..."}}
--
-- All would evade the 148b CHECK. This upgrade adds a regex over the
-- JSONB text representation that matches KEY position (the pattern
-- requires the key's closing quote + optional whitespace + colon,
-- so a legitimate value string that happens to contain "ssn:" is
-- not flagged).
--
-- Keeps the 148b top-level exact-match CHECK too so the two guards
-- stack (the exact-match check runs first and cheaper).
--
-- Safe on empty tables — a live contractor_onboarding row that
-- accidentally contained matching content would fail this migration.
-- No such rows exist today.
--
-- Note: the DB is DEFENSE-IN-DEPTH here. The primary guard is
-- app-layer key allowlisting in
-- /api/onboarding/contractor/[token] PATCH (installed in the same
-- commit as this migration).
-- ═════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contractor_onboarding_step_data_no_pii_deep'
  ) THEN
    ALTER TABLE public.contractor_onboarding
      ADD CONSTRAINT contractor_onboarding_step_data_no_pii_deep
      CHECK (
        step_data::text !~*
          '"[^"]*(ssn|social[^"]*security|tin|ein|routing[^"]*number|account[^"]*number|bank[^"]*account|card[^"]*number|credit[^"]*card|dob|date[^"]*of[^"]*birth|birthdate|passport)[^"]*"[[:space:]]*:'
      );
  END IF;
END $$;

COMMENT ON CONSTRAINT contractor_onboarding_step_data_no_pii_deep
  ON public.contractor_onboarding IS
  'Case-insensitive substring match on JSON KEY position — catches nested + camelCase + partial variants. Defense-in-depth; the API layer allowlists step_data keys as the primary guard.';
