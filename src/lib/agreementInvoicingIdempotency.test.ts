import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { invoiceAlreadyExists } from "./invoiceIdempotency";

/*
 * Signing-time invoice idempotency (Order #108 financial-spine audit).
 * A QuickBooks invoice can exist while the order's local invoice_status is
 * stale — #108's status write had targeted a non-existent
 * sales_orders.qb_invoice_id column and was swallowed, leaving
 * invoice_status='not_sent' even though QB Invoice 779 was sent. The guard
 * must therefore prefer canonical evidence (financial-spine link, then an
 * invoices row) over local status, and must never rely on the free-text
 * activity log.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("invoiceAlreadyExists — signing-time idempotency guard", () => {
  it("skips when invoice_status = 'sent'", () => {
    expect(invoiceAlreadyExists({ invoiceStatus: "sent" }).skip).toBe(true);
  });

  it("skips when invoice_status = 'paid'", () => {
    expect(invoiceAlreadyExists({ invoiceStatus: "paid" }).skip).toBe(true);
  });

  it("skips on a STALE status when a financial-spine invoice is linked", () => {
    const r = invoiceAlreadyExists({
      financialSpineInvoiceId: "inv-123",
      invoiceStatus: "not_sent",
    });
    expect(r.skip).toBe(true);
    expect(r.reason).toBe("financial_spine_invoice_linked");
  });

  it("skips on a STALE status when a canonical invoices row exists", () => {
    const r = invoiceAlreadyExists({
      hasCanonicalInvoiceRow: true,
      invoiceStatus: "not_sent",
    });
    expect(r.skip).toBe(true);
    expect(r.reason).toBe("canonical_invoice_row_exists");
  });

  it("does NOT skip when no invoice exists — exactly one is then created", () => {
    expect(
      invoiceAlreadyExists({
        financialSpineInvoiceId: null,
        hasCanonicalInvoiceRow: false,
        invoiceStatus: "not_sent",
      }).skip,
    ).toBe(false);
  });

  it("retry after partial failure: once the invoice row is persisted, a re-run skips", () => {
    // First attempt: no evidence yet -> creates.
    const first = invoiceAlreadyExists({ hasCanonicalInvoiceRow: false, invoiceStatus: "not_sent" });
    expect(first.skip).toBe(false);
    // The create path persists a canonical invoices row + link; the retry
    // sees that evidence and does not create a second invoice.
    const retry = invoiceAlreadyExists({ hasCanonicalInvoiceRow: true, invoiceStatus: "not_sent" });
    expect(retry.skip).toBe(true);
  });

  it("#108-shaped state cannot produce a second invoice once its invoice is linked", () => {
    // Raw #108 (pre-remediation): no canonical evidence, stale status ->
    // the guard alone would create, which is precisely why #108 must be
    // remediated (link its existing Invoice 779) before it is ever signed.
    expect(
      invoiceAlreadyExists({
        financialSpineInvoiceId: null,
        hasCanonicalInvoiceRow: false,
        invoiceStatus: "not_sent",
      }).skip,
    ).toBe(false);
    // After remediation (a public.invoices row for Invoice 779 linked via
    // financial_spine_invoice_id), signing can never double-invoice.
    expect(
      invoiceAlreadyExists({
        financialSpineInvoiceId: "inv-779",
        hasCanonicalInvoiceRow: true,
        invoiceStatus: "not_sent",
      }).skip,
    ).toBe(true);
  });
});

describe("no phantom sales_orders.qb_invoice_id writes remain in the invoice paths", () => {
  it("agreementInvoicing persists to the canonical invoices table, not qb_invoice_id", () => {
    const src = read("src/lib/agreementInvoicing.ts");
    expect(src).toContain("invoiceAlreadyExists");
    expect(src).toContain("upsertInvoice");
    expect(src).toContain("financial_spine_invoice_id");
    expect(src).not.toContain("qb_invoice_id: qbInvoiceId ?? order.qb_invoice_id");
  });

  it("/send no longer writes the phantom qb_invoice_id column", () => {
    const src = read("src/app/api/sales/orders/[id]/send/route.ts");
    expect(src).not.toContain("qb_invoice_id: qbInvoiceId");
    expect(src).not.toContain("statusUpdate.qb_invoice_id");
    // invoice_status is still persisted (the valid column)
    expect(src).toContain('invoice_status: "sent"');
  });
});
