import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseStub, type StubStore } from "@/lib/assistant/__testutils__/supabaseStub";

/**
 * Checkout gates and conversion. QuickBooks is a scripted fake; the
 * agreement gates are stubbed; Supabase is the in-memory stub.
 */
const store: StubStore = {};
let quoteSeq = 0;
const stub = createSupabaseStub(store, [], {
  defaults: {
    commerce_quotes: () => ({ quote_number: `VQ-260908-${String(++quoteSeq).padStart(4, "0")}`, status: "draft", currency: "USD", version: 1, confirmed_version: null, confirmed_at: null, expires_at: null, financing_program: null, financing_status: "none", financing_application_id: null, financing_interest_at: null, agreement_state: "not_required", subtotal: 0, tax_status: "pre_tax", total: 0, qb_customer_id: null, qb_invoice_id: null, qb_invoice_doc_number: null, qb_invoice_status: "none", checkout_status: "none", checkout_url: null, checkout_idempotency_key: null, checkout_started_at: null, checkout_completed_at: null, updated_at: new Date().toISOString() }),
    commerce_quote_lines: () => ({ staff_determination_by: null, staff_determination_at: null, staff_determination_note: null }),
  },
});
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));
vi.mock("@/lib/coffeePricing", () => ({ resolveCoffeeProductsPricing: async () => new Map() }));
const gates = { coffee: null as string | null };
vi.mock("@/lib/placementAgreements", () => ({ requireExecutedCoffeeSupplyAgreement: async () => gates.coffee }));
const qb = { customer: vi.fn(async () => ({ Id: "CUST-1" })), create: vi.fn(), send: vi.fn(async () => undefined), link: vi.fn(async (): Promise<{ Id: string; DocNumber: string; payUrl: string | null }> => ({ Id: "INV-1", DocNumber: "VQ-X", payUrl: "https://connect.intuit.com/pay/INV-1" })) };
vi.mock("@/lib/quickbooks", () => ({
  findOrCreateCustomer: (...a: unknown[]) => qb.customer(...(a as [])),
  createInvoice: (...a: unknown[]) => qb.create(...(a as [])),
  sendInvoiceEmail: (...a: unknown[]) => qb.send(...(a as [])),
  getInvoiceWithLink: (...a: unknown[]) => qb.link(...(a as [])),
}));

import { assessCheckout, checkoutQuote, loadCheckoutContext, markQuotePaidByInvoice } from "./checkout";
import { cancelQuote, confirmQuote, getCurrentQuote, getOrCreateDraft, getOwnedQuote, listLines, rebuildQuote } from "./quotes";

const U1 = "11111111-1111-4111-8111-000000000001";
const viewer = { userId: U1, storefront: null };
const IDS = { cooler: "c0000000-0000-4000-8000-00000000000a", vfreight: "c0000000-0000-4000-8000-00000000000b", website: "c0000000-0000-4000-8000-00000000000c", deposit: "c0000000-0000-4000-8000-00000000000e", tier: "c0000000-0000-4000-8000-00000000000f", brewer: "c0000000-0000-4000-8000-000000000010" };
function catalogRow(id: string, key: string, name: string, spec: { price: number; kind: string } & Record<string, unknown>) {
  const { price, kind, ...extra } = spec;
  return { id, catalog_key: key, name, description: null, item_type: "other", unit_price: String(price), sku: null, active: true, commerce_kind: kind, pricing_basis: "fixed_unit", tax_treatment: "qbo_automated", required_agreement: null, qualification_program: null, financing_program: null, add_on_parent_key: null, equipment_ownership: null, qb_item_id: "QBO-ITEM", ...extra };
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store.commerce_quotes = [];
  store.commerce_quote_lines = [];
  store.storefront_tenant_hidden_products = [];
  store.coffee_products = [];
  store.purchase_agreements = [];
  store.profiles = [{ id: U1, email: "jamie@example.com", full_name: "Jamie", phone: "555", address: "1 Main St", city: "Austin", state: "TX", zip: "78701" }];
  store.catalog_items = [
    catalogRow(IDS.website, "website-creation", "Website Creation", { price: 500, kind: "direct_checkout" }),
    catalogRow(IDS.cooler, "vendera-ai-cooler", "VendEra AI Cooler", { price: 3700, kind: "agreement_required", required_agreement: "machine_purchase" }),
    catalogRow(IDS.vfreight, "vending-machine-freight", "Vending Machine Freight", { price: 500, kind: "conditional_add_on", add_on_parent_key: "vendera-ai-cooler" }),
    catalogRow(IDS.deposit, "location-service-deposit", "Location Services Deposit", { price: 100, kind: "deposit_only", pricing_basis: "per_location" }),
    catalogRow(IDS.tier, "location-service-tier-1", "Location Services Tier 1", { price: 500, kind: "qualification_required", qualification_program: "location_tier" }),
    catalogRow(IDS.brewer, "flavia-c600-brewer", "Flavia C600 Brewer", { price: 0, kind: "agreement_required", required_agreement: "coffee_supply", equipment_ownership: "company_owned_loan" }),
  ];
  gates.coffee = null;
  qb.customer.mockClear();
  qb.create.mockReset();
  qb.create.mockImplementation(async () => ({ Id: "INV-1", DocNumber: "VQ-X" }));
  qb.send.mockClear();
  qb.link.mockClear();
});

async function confirmedQuote(refs: Array<[string, number]>) {
  const current = await getCurrentQuote(viewer.userId);
  if (current && (current.status === "draft" || current.status === "confirmed")) await cancelQuote(current);
  const draft = await getOrCreateDraft(viewer, null);
  const b = await rebuildQuote(draft, refs.map(([ref, quantity]) => ({ op: "add" as const, ref, quantity })), viewer);
  const c = await confirmQuote(b.quote, b.quote.version, viewer);
  if (c.outcome !== "confirmed") throw new Error(`expected confirmed, got ${c.outcome}: changes=${JSON.stringify(c.bundle.changes)} v=${c.bundle.quote.version} expected=${b.quote.version} lines=${JSON.stringify(c.bundle.lines.map((l) => [l.description, l.quantity, l.unit_price, l.sort_order]))}`);
  return c.bundle.quote;
}

describe("assessCheckout gates", () => {
  it("blocks when checkout is disabled, unconfirmed, unmapped, tax-unset, or the billing address is missing", async () => {
    const draft = await getOrCreateDraft(viewer, null);
    const b = await rebuildQuote(draft, [{ op: "add", ref: "website-creation", quantity: 1 }], viewer);
    let r = assessCheckout(b.quote, b.lines, await loadCheckoutContext(U1, b.lines), false);
    expect(r.blocked_reasons.map((x) => x.code)).toEqual(["checkout_disabled", "not_confirmed"]);
    const quote = await confirmedQuote([["website-creation", 1]]);
    const lines = await listLines(quote.id);
    expect(assessCheckout(quote, lines, await loadCheckoutContext(U1, lines), true).available).toBe(true);
    store.catalog_items[0].qb_item_id = null;
    store.catalog_items[0].tax_treatment = "unset";
    r = assessCheckout(quote, lines, await loadCheckoutContext(U1, lines), true);
    expect(r.blocked_reasons.map((x) => x.code).sort()).toEqual(["mapping_missing", "tax_unset"]);
    expect(r.blocked_reasons.every((x) => x.message.includes("staff-issued invoice"))).toBe(true);
    store.catalog_items[0].qb_item_id = "QBO-ITEM";
    store.catalog_items[0].tax_treatment = "qbo_automated";
    store.profiles[0].zip = null;
    r = assessCheckout(quote, lines, await loadCheckoutContext(U1, lines), true);
    expect(r.blocked_reasons.map((x) => x.code)).toEqual(["billing_address_missing"]);
  });

  it("requires the machine purchase agreement for the VendEra cooler and the coffee agreement for the C600", async () => {
    const quote = await confirmedQuote([["vendera-ai-cooler", 1]]);
    const lines = await listLines(quote.id);
    let r = assessCheckout(quote, lines, await loadCheckoutContext(U1, lines), true);
    expect(r.blocked_reasons.map((x) => x.code)).toEqual(["agreement_missing"]);
    expect(r.blocked_reasons[0].message).toContain("machine purchase agreement");
    store.purchase_agreements = [{ id: "PA1", agreement_type: "machine_purchase", agreement_status: "signed", operator_email: "jamie@example.com" }];
    r = assessCheckout(quote, lines, await loadCheckoutContext(U1, lines), true);
    expect(r.available).toBe(true);
    gates.coffee = "Sign the Equipment Loan & Beverage Supply Agreement to place orders.";
    const brewer = await confirmedQuote([["flavia-c600-brewer", 1]]);
    const bl = await listLines(brewer.id);
    r = assessCheckout(brewer, bl, await loadCheckoutContext(U1, bl), true);
    expect(r.blocked_reasons[0]).toMatchObject({ code: "agreement_missing", message: expect.stringContaining("Equipment Loan") });
  });

  it("tiers without a staff determination cannot be checked out; deposits route to the location intake", async () => {
    const quote = await confirmedQuote([["location-service-tier-1", 2], ["location-service-deposit", 3]]);
    const lines = await listLines(quote.id);
    const r = assessCheckout(quote, lines, await loadCheckoutContext(U1, lines), true);
    expect(r.blocked_reasons.map((x) => x.code)).toEqual(["requires_qualification"]);
    expect(r.location_intake_quantity).toBe(3);
    const depositOnly = await confirmedQuote([["location-service-deposit", 2]]);
    const dl = await listLines(depositOnly.id);
    expect(assessCheckout(depositOnly, dl, await loadCheckoutContext(U1, dl), true).blocked_reasons.map((x) => x.code)).toEqual(["nothing_to_invoice"]);
  });
});

describe("checkoutQuote conversion", () => {
  it("creates exactly one invoice with real Item references, a deterministic DocNumber, the billing address, and returns only the trusted link", async () => {
    store.purchase_agreements = [{ id: "PA1", agreement_type: "machine_purchase", agreement_status: "signed", operator_email: "JAMIE@example.com" }];
    const quote = await confirmedQuote([["vendera-ai-cooler", 2], ["website-creation", 1]]);
    const r = await checkoutQuote(quote.id, viewer, quote.version);
    expect(r.outcome).toBe("invoiced");
    if (r.outcome !== "invoiced") return;
    expect(r.pay_url).toBe("https://connect.intuit.com/pay/INV-1");
    expect(qb.create).toHaveBeenCalledTimes(1);
    const params = qb.create.mock.calls[0][0] as { docNumber: string; billAddr: { state: string }; lineItems: Array<{ description: string; quantity: number; qbItemId?: string }> };
    expect(params.docNumber).toBe(`${quote.quote_number}-V${quote.version}`);
    expect(params.billAddr.state).toBe("TX");
    expect(params.lineItems.map((l) => [l.description, l.quantity, l.qbItemId])).toEqual([["VendEra AI Cooler", 2, "QBO-ITEM"], ["Website Creation", 1, "QBO-ITEM"], ["Vending Machine Freight", 2, "QBO-ITEM"]]);
    const row = store.commerce_quotes.find((q) => q.id === quote.id)!;
    expect(row).toMatchObject({ status: "invoiced", qb_invoice_id: "INV-1", qb_customer_id: "CUST-1", checkout_status: "link_issued", checkout_idempotency_key: `vq:${quote.id}:v${quote.version}` });
    // Idempotent re-click: same invoice, no second create.
    const again = await checkoutQuote(quote.id, viewer, quote.version);
    expect(again.outcome).toBe("invoiced");
    expect(qb.create).toHaveBeenCalledTimes(1);
  });

  it("never creates an invoice when a gate fails, and never creates a partial invoice when QuickBooks fails", async () => {
    const blocked = await confirmedQuote([["vendera-ai-cooler", 1]]);
    const r = await checkoutQuote(blocked.id, viewer, blocked.version);
    expect(r.outcome).toBe("blocked");
    expect(qb.create).not.toHaveBeenCalled();
    store.purchase_agreements = [{ id: "PA1", agreement_type: "machine_purchase", agreement_status: "signed", operator_email: "jamie@example.com" }];
    qb.create.mockRejectedValueOnce(new Error("QB create invoice failed: line 2 rejected"));
    await expect(checkoutQuote(blocked.id, viewer, blocked.version)).rejects.toMatchObject({ code: "upstream_error" });
    const row = store.commerce_quotes.find((q) => q.id === blocked.id)!;
    expect(row).toMatchObject({ status: "confirmed", checkout_status: "failed", qb_invoice_id: null });
    expect(qb.create).toHaveBeenCalledTimes(1);
  });

  it("refuses a stale version, an unconfirmed quote, a foreign owner, and drops an untrusted link", async () => {
    const quote = await confirmedQuote([["website-creation", 1]]);
    await expect(checkoutQuote(quote.id, viewer, quote.version + 1)).rejects.toMatchObject({ code: "version_mismatch" });
    await expect(checkoutQuote(quote.id, { userId: "11111111-1111-4111-8111-000000000002", storefront: null }, quote.version)).rejects.toMatchObject({ code: "not_found" });
    store.catalog_items[0].unit_price = "550.00";
    const changed = await checkoutQuote(quote.id, viewer, quote.version);
    expect(changed.outcome).toBe("changed");
    expect(qb.create).not.toHaveBeenCalled();
    const c = await confirmQuote(await getOwnedQuote(quote.id, U1), quote.version + 1, viewer);
    expect(c.outcome).toBe("confirmed");
    qb.link.mockResolvedValueOnce({ Id: "INV-1", DocNumber: "VQ-X", payUrl: null });
    const r = await checkoutQuote(quote.id, viewer, c.bundle.quote.version);
    expect(r.outcome).toBe("invoiced");
    if (r.outcome === "invoiced") expect(r.pay_url).toBeNull();
    expect(store.commerce_quotes.find((q) => q.id === quote.id)!.checkout_status).toBe("failed");
  });

  it("a QuickBooks payment webhook marks the invoiced quote paid, and only that quote", async () => {
    const quote = await confirmedQuote([["website-creation", 1]]);
    await checkoutQuote(quote.id, viewer, quote.version);
    expect(await markQuotePaidByInvoice("INV-OTHER")).toBe(false);
    expect(await markQuotePaidByInvoice("INV-1")).toBe(true);
    expect(store.commerce_quotes.find((q) => q.id === quote.id)).toMatchObject({ status: "paid", checkout_status: "paid", qb_invoice_status: "paid" });
  });
});
