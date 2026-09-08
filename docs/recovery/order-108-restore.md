# Order #108 — deletion forensics & recovery plan (Phase 5C-a9)

**Status: PLAN ONLY. Nothing here has been executed. No production data has been modified.**

Order #108 (`c7b55fca-d0a5-4d0d-85fc-068bf544b8cc`, `order_number = 108`) no
longer exists in `public.sales_orders`. Its `order_items` and
`order_activity_log` rows are gone (0 rows), and both of its purchase
agreements now have `order_id = NULL`.

## 1. How it was deleted

`DELETE /api/sales/orders/[id]` (`src/app/api/sales/orders/[id]/route.ts`),
invoked from the Orders list UI (`src/app/sales/orders/page.tsx` →
`deleteOrder`). Before Phase 5C-a9 this route:

- required only an **elevated role** (`isElevatedRole`);
- performed a **hard delete** (`.from("sales_orders").delete().eq("id", id)`);
- had **no guard** on `invoice_status`, agreement status, payment, or
  fulfillment — an invoiced, agreement-bearing order was as deletable as an
  empty draft;
- relied on a **client-side `window.confirm` only**.

The FK behaviour then produced exactly the observed end-state:

| child                | FK rule            | effect on delete          |
|----------------------|--------------------|---------------------------|
| `order_items`        | ON DELETE CASCADE  | rows removed (now 0)      |
| `order_activity_log` | ON DELETE CASCADE  | rows removed (now 0)      |
| `purchase_agreements`| ON DELETE SET NULL | `order_id → NULL` (orphaned)|

This is the **only** general order-delete path. The other `sales_orders`
delete (`agreements/[id]/create-order/route.ts:109`) is a rollback that only
removes an order it created microseconds earlier when its line-item insert
fails — not a candidate for #108.

## 2. Prevention (shipped in this phase)

- `src/lib/orders/deleteGuard.ts` — pure `assessOrderDeletable()` blocks a
  hard delete when the order has durable commercial history (invoice
  sent/paid, financial-spine link, an `invoices` row, a protected agreement
  status incl. `cancelled`, a non-`unpaid` payment, or any status past a
  disposable `draft`).
- The DELETE route now gathers that evidence **before** deleting and returns
  **409** with a precise reason; a rejected delete touches nothing.
- `src/lib/agreements/autoInvoiceGuard.ts` — `shouldAutoCreateOrderOnSign()`
  stops an orphaned **replacement** agreement (no linked order) from minting a
  duplicate order+invoice at signing.

With the guard in place, a #108-shaped order (`invoice_status = 'sent'`) can
no longer be hard-deleted.

## 3. Recoverable vs unknown fields

**Known / recoverable:**

| field | value | source |
|---|---|---|
| `id` | `c7b55fca-d0a5-4d0d-85fc-068bf544b8cc` | ticket |
| `order_number` | `108` | ticket |
| `account_id` | `90a88030-f905-4295-ba61-87e845a1ee9d` | ticket |
| `created_by` | `cdab3185-5a2d-41d6-bc44-416271a28df0` | surviving agreements |
| `document_type` | `order` | ticket |
| `total_value` / `remaining_balance` | `46099.99` | ticket + snapshot |
| `invoice_status` | `sent` | ticket (Invoice 779) |
| `payment_status` | `unpaid` | ticket |
| `financial_spine_invoice_id` | `NULL` | ticket |
| `recipient_email` | agreement `operator_email` | replacement agreement |
| `is_ten_ten_ten` | `true` | **evidence:** "10/10/10 Financing" + "Location Services 10/10/10" lines and prepaid location treatment (deposit-only off, location fee included in the total) |

**Desired post-recovery workflow state** (reflects the unsent replacement
draft): `order_status = draft`, `agreement_status = not_sent`,
`next_required_action = "Review and send replacement agreement"`.

**Unknown (must be assumed or accepted):**

- `order_type` — assumed `machine_purchase` (standard for this deal shape).
- `assigned_rep_id` — assumed equal to `created_by`.
- `deposit_amount` / `deposit_paid` — assumed `0` / `false` (prepaid 10/10/10,
  unpaid, no split).
- `fulfillment_status` — assumed `pending` (nothing fulfilled).
- `created_at` — original timestamp is unrecoverable; `now()` is used.

## 4. Reconstruction

See `scripts/recovery/restore-order-108.sql` — a single transaction that:

1. asserts preconditions (order UUID/number absent; replacement present,
   draft, orphaned; replacement total = `46099.99`) and aborts on any
   mismatch;
2. inserts `sales_orders` with the **original UUID** and `order_number 108`;
3. recreates the **six** `order_items` from the replacement snapshot;
4. relinks the replacement agreement (`9d3b07fd-…`) to the restored order;
5. optionally (commented out) relinks the cancelled historical agreement;
6. writes one explicit recovery audit event;
7. asserts postconditions (items sum to `46099.99`; header == items) before
   `COMMIT`.

It creates **no** invoice, sends **no** email, signs nothing, triggers no
fulfillment, and does not alter payment state.

## 5. Activity-history strategy

The original `order_activity_log` was cascade-deleted and its exact
chronology is unrecoverable. **Do not fabricate the historical log.** Record
exactly **one** explicit event —

> "Order restored after unintended hard deletion; commercial basis
> reconstructed from the preserved replacement-agreement snapshot and
> previously-issued Invoice 779."

— and leave the historical rows absent rather than inventing timestamps.

## 6. Duplicate-invoice safety after restoration

`invoice_status = 'sent'` on the restored order means the signing-time guard
`sendInvoiceForSignedAgreement` → `invoiceAlreadyExists` **skips** re-invoicing
(`agreementInvoicing.ts:143–158`). Combined with the replacement's
`auto_send_invoice_on_signing = false` and the new `shouldAutoCreateOrderOnSign`
replacement block, the restored+relinked replacement **cannot** mint Invoice
780. Invoice 779 is preserved and untouched.
