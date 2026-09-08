-- Phase 2 finalisation: permanent checkout rollout flag and quote status
-- reconciliation bookkeeping.
--
--   assistant.checkout_public_enabled (seeded false)
--     checkout_enabled=false                      nobody can create invoices
--     checkout_enabled=true,  public=false        verified administrators only
--     checkout_enabled=true,  public=true         eligible authenticated customers
--
--   commerce_quotes.status_reconciled_at
--     last time the owner asked the read-only quote-status endpoint to
--     reconcile the stored invoice; the endpoint refuses to re-check
--     sooner than its minimum interval (a database-backed rate limit).
--
-- Nothing here changes grants or policies: the table keeps the posture
-- from 20260907221654 (anon: none; authenticated: SELECT own rows only;
-- service_role: full).

INSERT INTO public.platform_feature_flags (key, enabled, description)
VALUES
  ('assistant.checkout_public_enabled', false,
   'Vinnie checkout rollout. With assistant.checkout_enabled on and this off, only verified administrators can create invoices; on, eligible authenticated customers can.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.commerce_quotes
  ADD COLUMN IF NOT EXISTS status_reconciled_at timestamptz;
