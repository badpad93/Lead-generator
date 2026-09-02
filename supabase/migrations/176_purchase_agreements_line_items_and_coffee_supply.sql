-- purchase_agreements: preserve full line-item snapshot + attach the
-- Equipment Loan & Beverage Supply Agreement for coffee sales.
--
-- Two problems fixed here, in one migration since they touch the
-- same table and the two features ship together:
--
-- Problem 1 — item drift.
--   The order → agreement conversion (see
--   src/app/api/sales/orders/[id]/agreement/route.ts before commit
--   a8c385c) reads only item_type IN ('machine_sale','location_services')
--   and drops everything else: coffee_program, vendera_ai_cooler,
--   combo_machine, financing, other, and any custom line. Multiple
--   machine_sale lines at different prices collapse to the FIRST
--   line's unit_price. Discount_percent is silently ignored.
--   purchase_agreements can't fix this by looking harder at scalar
--   columns; the shape is inherently lossy.
--
--   line_items_snapshot JSONB stores every order_items row verbatim
--   at agreement-creation time. Same shape as order_items:
--     [{ item_type, service_name, description, quantity,
--        unit_price, discount_percent, total_price,
--        deposit_required, ... }, ...]
--   Existing scalar columns stay (equipment_subtotal, machine_quantity,
--   locations_purchased, etc.) so legacy readers keep working, but
--   the snapshot is the new source of truth for any consumer that
--   wants the full picture. Editable via PATCH /api/sales/agreements/[id].
--
-- Problem 2 — coffee brewer → Equipment Loan & Beverage Supply Agreement.
--   Per business rule, any agreement whose items include a coffee
--   brewer/coffee_program line requires the customer to accept the
--   current Equipment Loan & Beverage Supply Agreement. Today
--   that agreement is a separate subsystem (agreement_templates +
--   user_agreements) invoked only from src/app/api/coffee/agreement/*
--   — the sales flow never touches it. We snapshot the currently-
--   active coffee_supply template onto the purchase_agreement at
--   creation time so the customer's signature on the purchase
--   agreement covers a specific, immutable version of the supply
--   agreement text — if the template changes later, the historical
--   record is preserved.
--
--   coffee_supply_required boolean flag drives UI + downstream
--   requirement checks. Auto-set true when any coffee_program line
--   is in the order at agreement-creation.
--
--   coffee_supply_snapshot JSONB stores:
--     { template_id, agreement_type, version, title,
--       content_html, content_hash, effective_date, captured_at }
--
-- Both columns are additive + nullable — nothing breaks for
-- existing purchase_agreements rows. No backfill needed.

ALTER TABLE public.purchase_agreements
  ADD COLUMN IF NOT EXISTS line_items_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS coffee_supply_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coffee_supply_snapshot jsonb;

COMMENT ON COLUMN public.purchase_agreements.line_items_snapshot IS
  'Full order_items snapshot at agreement-creation time — every line preserved verbatim so coffee/cooler/financing/other lines survive the conversion. Editable via agreement PATCH. Legacy scalar columns stay populated for backwards compat but the snapshot is authoritative.';
COMMENT ON COLUMN public.purchase_agreements.coffee_supply_required IS
  'True when the source order contains at least one coffee_program line and the customer must accept the Equipment Loan & Beverage Supply Agreement as part of signing this purchase_agreement.';
COMMENT ON COLUMN public.purchase_agreements.coffee_supply_snapshot IS
  'Immutable snapshot of the currently-active coffee_supply agreement_templates row at creation time (template_id, version, title, content_html, content_hash, captured_at). Preserves what the customer actually agreed to even if the template is updated later.';

CREATE INDEX IF NOT EXISTS idx_purchase_agreements_coffee_supply_required
  ON public.purchase_agreements(coffee_supply_required)
  WHERE coffee_supply_required = true;
