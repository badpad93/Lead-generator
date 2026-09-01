-- Fix cross-tenant financial disclosure on
-- storefront_commission_balances.
--
-- The view created in migration 170 was missing
-- security_invoker=true. Views default to security_definer semantics
-- in Postgres: the view runs with the OWNER's permissions, not the
-- querying user's. That bypasses row-level security on the
-- underlying storefront_commission_ledger table, so any authenticated
-- user querying storefront_commission_balances would receive every
-- tenant's balance rollup — a cross-tenant financial disclosure.
--
-- Turning security_invoker on makes the view honor the ledger's RLS
-- ("Owner reads tenant ledger" / "Admins read all ledger"), so a
-- tenant owner only sees their own row and a customer sees nothing.
--
-- Idempotent: ALTER VIEW ... SET is a no-op if the setting is
-- already true.

ALTER VIEW public.storefront_commission_balances SET (security_invoker = true);

COMMENT ON VIEW public.storefront_commission_balances IS
  'Per-tenant commission balance roll-up. Sums signed commission_amount grouped by status. Reversal rows are already negative so lifetime_net is truthful. Runs with security_invoker=true so RLS on storefront_commission_ledger is honored.';
