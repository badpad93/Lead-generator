-- 181: purchase_agreements pricing defaults must not invent charges.
--
-- Migration 087 gave the table opinionated defaults that leaked into
-- generated contracts whenever a code path didn't set the column:
--   standard_freight_rate   500.00  (shown as "Standard Freight Rate"
--   discounted_freight_rate 375.00   in the contract text, disagreeing
--   freight_per_machine     375.00   with the quote/order line items)
--   freight_total           375.00
--   storage_fee_per_machine_month 50.00  (a $50/mo storage fee that is
--                                         not a line item ANYWHERE in
--                                         the quote/order/agreement flow)
--
-- App code now sets every freight field from the order's actual
-- freight line, and storage to 0. These column defaults are the
-- backstop for any other writer: freight defaults align with the
-- app-level $350 default, and storage defaults to no charge.
ALTER TABLE public.purchase_agreements
  ALTER COLUMN standard_freight_rate SET DEFAULT 350.00,
  ALTER COLUMN discounted_freight_rate SET DEFAULT 350.00,
  ALTER COLUMN freight_per_machine SET DEFAULT 350.00,
  ALTER COLUMN freight_total SET DEFAULT 350.00,
  ALTER COLUMN storage_fee_per_machine_month SET DEFAULT 0.00;
