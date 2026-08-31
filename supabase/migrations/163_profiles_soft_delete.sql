-- Soft-delete column on profiles.
--
-- Hard delete of a profile fails whenever the account has any
-- referenced history (sales_orders, workflows, workflow_assignments,
-- coffee_orders, agreements, etc.) because those tables' FK
-- constraints RESTRICT the delete. That is why admins cannot delete
-- users in production today — Postgres refuses and the API bubbles
-- the constraint error up.
--
-- Adding a nullable deleted_at column lets the DELETE endpoint fall
-- back to a soft delete when the hard delete is blocked. The row
-- stays (so referring rows keep their FK) but PII is anonymized in
-- the same API call, the auth user is deleted so the account cannot
-- log in again, and every list endpoint filters deleted_at IS NOT
-- NULL out of results. Historical joins still render "Deleted User"
-- instead of a broken reference.
--
-- Idempotent — ADD COLUMN IF NOT EXISTS + partial index IF NOT EXISTS.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.profiles.deleted_at IS
  'Set when the profile is soft-deleted by admin. Row stays for FK integrity but PII is redacted at delete time and the row must be filtered out of user lists.';

-- Fast filter for the common "active users only" list query.
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON public.profiles(deleted_at) WHERE deleted_at IS NULL;
