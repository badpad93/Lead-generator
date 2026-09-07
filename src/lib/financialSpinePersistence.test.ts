import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Phase 5C-a6 — QuickBooks invoice persistence finalization. sales_orders has
 * NO qb_invoice_id column; every QB-invoice-creation path for a sales_order
 * must persist to public.invoices and link financial_spine_invoice_id, and no
 * active code may read/write the phantom sales_orders.qb_invoice_id. Legit
 * qb_invoice_id columns on OTHER tables (coffee_orders, lead_purchases,
 * sales_leads, …) must remain untouched.
 *
 * No DB in this env, so these are source-level regression guards; the runtime
 * idempotency decision is unit-tested in agreementInvoicingIdempotency.test.ts.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("no phantom sales_orders.qb_invoice_id remains in active code", () => {
  it("generateAgreementPdf auto-invoice persists canonically, not qb_invoice_id", () => {
    const src = read("src/lib/generateAgreementPdf.ts");
    expect(src).not.toContain('qb_invoice_id: qbInvoiceId, invoice_status: "sent"');
    expect(src).toContain("upsertInvoice");
    expect(src).toContain("financial_spine_invoice_id: inv.id");
  });

  it("request-location deposit invoice links the financial spine", () => {
    const src = read("src/app/api/request-location/route.ts");
    expect(src).toContain("upsertInvoice");
    expect(src).toContain("financial_spine_invoice_id: inv.id");
    // the legitimate sales_leads.qb_invoice_id write is preserved
    expect(src).toContain('from("sales_leads")');
  });

  it("QB webhook matches sales_orders via public.invoices, not qb_invoice_id", () => {
    const src = read("src/app/api/webhooks/quickbooks/route.ts");
    expect(src).not.toContain("qb_invoice_id.eq.${invoiceId},location_remaining_qb_invoice_id");
    expect(src).toContain('.eq("provider_invoice_id", invoiceId)');
    // legitimate per-table qb_invoice_id matches (coffee_orders, lead_purchases,
    // etc.) remain
    expect(src).toContain('.eq("qb_invoice_id", invoiceId)');
  });

  it("commissions orphan-repair uses invoices.order_id, not sales_orders.qb_invoice_id", () => {
    const src = read("src/lib/commissions.ts");
    expect(src).not.toContain("qb_invoice_id.eq.${qbInvoiceId},location_remaining_qb_invoice_id");
    expect(src).toContain("orderId = inv?.order_id ?? null;");
  });

  it("status route no longer reads orderRow.qb_invoice_id", () => {
    const src = read("src/app/api/sales/orders/[id]/status/route.ts");
    expect(src).not.toContain("qb_invoice_id: orderRow.qb_invoice_id");
    expect(src).not.toContain("qb_invoice_id?: string | null;");
  });

  it("sendOrderReceipt resolves invoice_number from the financial spine", () => {
    const src = read("src/lib/sendOrderReceipt.ts");
    expect(src).not.toContain("order.qb_invoice_id");
    expect(src).toContain("invoice_number: invoiceNumber");
  });

  it("send route persists canonically (invoices + financial spine), never qb_invoice_id", () => {
    const src = read("src/app/api/sales/orders/[id]/send/route.ts");
    expect(src).not.toContain("qb_invoice_id: qbInvoiceId");
    expect(src).not.toContain("statusUpdate.qb_invoice_id");
    expect(src).toContain("upsertInvoice");
    expect(src).toContain("financial_spine_invoice_id: inv.id");
  });

  it("agreementInvoicing (fixed earlier) persists via upsertInvoice + financial spine", () => {
    const src = read("src/lib/agreementInvoicing.ts");
    expect(src).toContain("upsertInvoice");
    expect(src).toContain("financial_spine_invoice_id");
    expect(src).not.toContain("qb_invoice_id: qbInvoiceId ?? order.qb_invoice_id");
  });
});

describe("legitimate qb_invoice_id on non-sales_orders tables is untouched", () => {
  it("coffee checkout still persists coffee_orders.qb_invoice_id", () => {
    const src = read("src/app/api/coffee/checkout/route.ts");
    expect(src).toContain("qb_invoice_id: invoice.Id");
  });

  it("location remaining-balance invoice keeps its dedicated column (multi-invoice exception)", () => {
    const src = read("src/app/api/sales/orders/[id]/locations/invoice-remaining/route.ts");
    expect(src).toContain("location_remaining_qb_invoice_id: qbInvoiceId");
  });

  it("apex placement invoice keeps apex_placement_qb_invoice_id on purchase_agreements", () => {
    const src = read("src/app/api/sales/agreements/[id]/send-apex-placement-invoice/route.ts");
    expect(src).toContain("apex_placement_qb_invoice_id: qbInvoiceId");
  });
});
