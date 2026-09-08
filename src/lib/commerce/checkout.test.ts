import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSupabaseStub, type StubStore } from "@/lib/assistant/__testutils__/supabaseStub";
import { createFakeQbo } from "./__testutils__/fakeQbo";

/**
 * Checkout gates and conversion through the isolated, production-only
 * adapter. QuickBooks is an in-memory fake behind the existing low-level
 * fetch; the agreement gates and Supabase are stubs. No network.
 */
const store: StubStore = {};
let quoteSeq = 0;
const stub = createSupabaseStub(store, [], {
  defaults: {
    commerce_quotes: () => ({ quote_number: `VQ-260908-${String(++quoteSeq).padStart(4, "0")}`, status: "draft", currency: "USD", version: 1, confirmed_version: null, confirmed_at: null, expires_at: null, financing_program: null, financing_status: "none", financing_application_id: null, financing_interest_at: null, agreement_state: "not_required", subtotal: 0, tax_status: "pre_tax", total: 0, qb_customer_id: null, qb_invoice_id: null, qb_invoice_doc_number: null, qb_invoice_status: "none", checkout_status: "none", checkout_url: null, checkout_idempotency_key: null, checkout_started_at: null, checkout_completed_at: null, status_reconciled_at: null, updated_at: new Date().toISOString() }),
    commerce_quote_lines: () => ({ staff_determination_by: null, staff_determination_at: null, staff_determination_note: null }),
  },
});
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));
vi.mock("@/lib/coffeePricing", () => ({ resolveCoffeeProductsPricing: async () => new Map() }));
const gates = { coffee: null as string | null };
vi.mock("@/lib/placementAgreements", () => ({ requireExecutedCoffeeSupplyAgreement: async () => gates.coffee }));
const qbo = createFakeQbo();
const env = { qbProduction: true };
vi.mock("@/lib/quickbooks", () => ({
  qbApi: (path: string, options?: RequestInit) => qbo.api(path, options),
  isQbProduction: () => env.qbProduction,
}));

import { assessCheckout, checkoutQuote, loadCheckoutContext, reconcileQuoteStatus, type CheckoutAccess, NO_CHECKOUT_ACCESS } from "./checkout";
import { cancelQuote, confirmQuote, getCurrentQuote, getOrCreateDraft, getOwnedQuote, listLines, rebuildQuote } from "./quotes";

const U1 = "11111111-1111-4111-8111-000000000001";
const U2 = "11111111-1111-4111-8111-000000000002";
const viewer = { userId: U1, storefront: null };
const FULL: CheckoutAccess = { checkoutEnabled: true, publicEnabled: true, isAdmin: false, environmentAllowed: true };
const IDS = { cooler: "c0000000-0000-4000-8000-00000000000a", vfreight: "c0000000-0000-4000-8000-00000000000b", website: "c0000000-0000-4000-8000-00000000000c", deposit: "c0000000-0000-4000-8000-00000000000e", tier: "c0000000-0000-4000-8000-00000000000f", brewer: "c0000000-0000-4000-8000-000000000010" };
function catalogRow(id: string, key: string, name: string, spec: { price: number; kind: string } & Record<string, unknown>) {
  const { price, kind, ...extra } = spec;
  return { id, catalog_key: key, name, description: null, item_type: "other", unit_price: String(price), sku: null, active: true, commerce_kind: kind, pricing_basis: "fixed_unit", tax_treatment: "qbo_automated", required_agreement: null, qualification_program: null, financing_program: null, add_on_parent_key: null, equipment_ownership: null, qb_item_id: "1001", ...extra };
}
const signedAgreement = (extra: Record<string, unknown>) => ({ id: "PA1", agreement_type: "machine_purchase", agreement_status: "signed", operator_email: "jamie@example.com", operator_id: null, ...extra });

const savedEnv = { VERCEL_ENV: process.env.VERCEL_ENV };
beforeEach(() => {
  process.env.VERCEL_ENV = "production";
  env.qbProduction = true;
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
  qbo.reset();
});
afterEach(() => {
  if (savedEnv.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = savedEnv.VERCEL_ENV;
});

async function confirmedQuote(refs: Array<[string, number]>) {
  const current = await getCurrentQuote(viewer.userId);
  if (current && (current.status === "draft" || current.status === "confirmed")) await cancelQuote(current);
  const draft = await getOrCreateDraft(viewer, null);
  const b = await rebuildQuote(draft, refs.map(([ref, quantity]) => ({ op: "add" as const, ref, quantity })), viewer);
  const c = await confirmQuote(b.quote, b.quote.version, viewer);
  if (c.outcome !== "confirmed") throw new Error(`expected confirmed, got ${c.outcome}`);
  return c.bundle.quote;
}
const codes = (r: { blocked_reasons: Array<{ code: string }> }) => r.blocked_reasons.map((x) => x.code);
const quoteRow = (id: string) => store.commerce_quotes.find((q) => q.id === id)!;

describe("assessCheckout gates", () => {
  it("blocks when checkout is disabled, unconfirmed, unmapped, tax-unset, or the billing address is missing", async () => {
    const draft = await getOrCreateDraft(viewer, null);
    const b = await rebuildQuote(draft, [{ op: "add", ref: "website-creation", quantity: 1 }], viewer);
    let r = assessCheckout(b.quote, b.lines, await loadCheckoutContext(U1, b.lines), NO_CHECKOUT_ACCESS);
    expect(codes(r)).toEqual(["checkout_disabled", "checkout_unavailable_here", "not_confirmed"]);
    const quote = await confirmedQuote([["website-creation", 1]]);
    const lines = await listLines(quote.id);
    expect(assessCheckout(quote, lines, await loadCheckoutContext(U1, lines), FULL).available).toBe(true);
    store.catalog_items[0].qb_item_id = null;
    store.catalog_items[0].tax_treatment = "unset";
    r = assessCheckout(quote, lines, await loadCheckoutContext(U1, lines), FULL);
    expect(codes(r).sort()).toEqual(["mapping_missing", "tax_unset"]);
    expect(r.blocked_reasons.every((x) => x.message.includes("staff-issued invoice"))).toBe(true);
    store.catalog_items[0].qb_item_id = "1001";
    store.catalog_items[0].tax_treatment = "qbo_automated";
    store.profiles[0].zip = null;
    r = assessCheckout(quote, lines, await loadCheckoutContext(U1, lines), FULL);
    expect(codes(r)).toEqual(["billing_address_missing"]);
  });

  it("flag matrix: disabled blocks everyone; enabled without public admits administrators only; public admits customers", async () => {
    const quote = await confirmedQuote([["website-creation", 1]]);
    const lines = await listLines(quote.id);
    const ctx = await loadCheckoutContext(U1, lines);
    const assess = (a: Partial<CheckoutAccess>) => codes(assessCheckout(quote, lines, ctx, { ...FULL, ...a }));
    expect(assess({ checkoutEnabled: false, publicEnabled: true, isAdmin: true })).toEqual(["checkout_disabled"]);
    expect(assess({ checkoutEnabled: true, publicEnabled: false, isAdmin: false })).toEqual(["checkout_admin_only"]);
    expect(assess({ checkoutEnabled: true, publicEnabled: false, isAdmin: true })).toEqual([]);
    expect(assess({ checkoutEnabled: true, publicEnabled: true, isAdmin: false })).toEqual([]);
    expect(assess({ environmentAllowed: false })).toEqual(["checkout_unavailable_here"]);
  });

  it("machine purchase agreements authorise only through operator_id ownership; email-only rows require staff review", async () => {
    const quote = await confirmedQuote([["vendera-ai-cooler", 1]]);
    const lines = await listLines(quote.id);
    const assess = async () => assessCheckout(quote, lines, await loadCheckoutContext(U1, lines), FULL);
    expect(codes(await assess())).toEqual(["agreement_missing"]);
    store.purchase_agreements = [signedAgreement({ operator_email: "JAMIE@example.com" })];
    let r = await assess();
    expect(codes(r)).toEqual(["agreement_unverified"]);
    expect(r.blocked_reasons[0].message).toMatch(/staff review/i);
    store.purchase_agreements = [signedAgreement({ operator_id: U2 })];
    expect(codes(await assess())).toEqual(["agreement_missing"]);
    store.purchase_agreements = [signedAgreement({ operator_id: U1, operator_email: "someone-else@example.com" })];
    r = await assess();
    expect(r.available).toBe(true);
    store.purchase_agreements = [signedAgreement({ operator_id: U1, agreement_status: "sent" })];
    expect(codes(await assess())).toEqual(["agreement_missing"]);
    gates.coffee = "Sign the Equipment Loan & Beverage Supply Agreement to place orders.";
    const brewer = await confirmedQuote([["flavia-c600-brewer", 1]]);
    const bl = await listLines(brewer.id);
    expect(assessCheckout(brewer, bl, await loadCheckoutContext(U1, bl), FULL).blocked_reasons[0]).toMatchObject({ code: "agreement_missing", message: expect.stringContaining("Equipment Loan") });
  });

  it("tiers without a staff determination cannot be checked out; deposits route to the location intake", async () => {
    const quote = await confirmedQuote([["location-service-tier-1", 2], ["location-service-deposit", 3]]);
    const lines = await listLines(quote.id);
    const r = assessCheckout(quote, lines, await loadCheckoutContext(U1, lines), FULL);
    expect(codes(r)).toEqual(["requires_qualification"]);
    expect(r.location_intake_quantity).toBe(3);
    const depositOnly = await confirmedQuote([["location-service-deposit", 2]]);
    const dl = await listLines(depositOnly.id);
    expect(codes(assessCheckout(depositOnly, dl, await loadCheckoutContext(U1, dl), FULL))).toEqual(["nothing_to_invoice"]);
  });
});

describe("checkoutQuote conversion", () => {
  it("creates exactly one invoice with Item references, a deterministic DocNumber, the billing address, and returns only the validated link", async () => {
    store.purchase_agreements = [signedAgreement({ operator_id: U1 })];
    const quote = await confirmedQuote([["vendera-ai-cooler", 2], ["website-creation", 1]]);
    const r = await checkoutQuote(quote.id, viewer, quote.version, FULL);
    expect(r.outcome).toBe("invoiced");
    if (r.outcome !== "invoiced") return;
    expect(r.pay_url).toBe("https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-v1-abc");
    const creates = qbo.requests.filter((x) => x.method === "POST" && x.path === "/invoice");
    expect(creates).toHaveLength(1);
    const body = creates[0].body as { DocNumber: string; BillAddr: { CountrySubDivisionCode: string }; Line: Array<{ Description: string; SalesItemLineDetail: { Qty: number; ItemRef: { value: string } } }> };
    expect(body.DocNumber).toBe(`${quote.quote_number}-V${quote.version}`);
    expect(body.BillAddr.CountrySubDivisionCode).toBe("TX");
    expect(body.Line.map((l) => [l.Description, l.SalesItemLineDetail.Qty, l.SalesItemLineDetail.ItemRef.value])).toEqual([["VendEra AI Cooler", 2, "1001"], ["Website Creation", 1, "1001"], ["Vending Machine Freight", 2, "1001"]]);
    expect(quoteRow(quote.id)).toMatchObject({ status: "invoiced", qb_invoice_id: qbo.invoices[0].Id, checkout_status: "link_issued", checkout_idempotency_key: `vq:${quote.id}:v${quote.version}` });
    // Idempotent re-click: same invoice, no second create, no new customer.
    const again = await checkoutQuote(quote.id, viewer, quote.version, FULL);
    expect(again.outcome).toBe("invoiced");
    expect(qbo.requests.filter((x) => x.method === "POST" && x.path === "/invoice")).toHaveLength(1);
    expect(qbo.customers).toHaveLength(1);
  });

  it("a duplicate DocNumber on retry resolves to the existing invoice instead of a second one", async () => {
    const quote = await confirmedQuote([["website-creation", 1]]);
    // Simulate a prior create that succeeded on Intuit's side but was never recorded.
    qbo.invoices.push({ Id: "INV-ORPHAN", DocNumber: `${quote.quote_number}-V${quote.version}`, TotalAmt: 500, Balance: 500, Line: [] });
    const r = await checkoutQuote(quote.id, viewer, quote.version, FULL);
    expect(r.outcome).toBe("invoiced");
    expect(qbo.requests.filter((x) => x.method === "POST" && x.path === "/invoice")).toHaveLength(0);
    expect(quoteRow(quote.id).qb_invoice_id).toBe("INV-ORPHAN");
  });

  it("never creates an invoice when a gate fails, and never leaves a partial invoice when QuickBooks fails", async () => {
    const blocked = await confirmedQuote([["vendera-ai-cooler", 1]]);
    const r = await checkoutQuote(blocked.id, viewer, blocked.version, FULL);
    expect(r.outcome).toBe("blocked");
    expect(qbo.requests).toHaveLength(0);
    store.purchase_agreements = [signedAgreement({ operator_id: U1 })];
    qbo.failNextInvoiceCreate = { status: 400, body: "line 2 rejected" };
    await expect(checkoutQuote(blocked.id, viewer, blocked.version, FULL)).rejects.toMatchObject({ code: "upstream_error" });
    expect(quoteRow(blocked.id)).toMatchObject({ status: "confirmed", checkout_status: "failed", qb_invoice_id: null });
    expect(qbo.invoices).toHaveLength(0);
  });

  it("refuses a stale version, an unconfirmed quote, a foreign owner, and drops an untrusted hosted link", async () => {
    const quote = await confirmedQuote([["website-creation", 1]]);
    await expect(checkoutQuote(quote.id, viewer, quote.version + 1, FULL)).rejects.toMatchObject({ code: "version_mismatch" });
    await expect(checkoutQuote(quote.id, { userId: U2, storefront: null }, quote.version, FULL)).rejects.toMatchObject({ code: "not_found" });
    store.catalog_items[0].unit_price = "550.00";
    const changed = await checkoutQuote(quote.id, viewer, quote.version, FULL);
    expect(changed.outcome).toBe("changed");
    expect(qbo.requests).toHaveLength(0);
    const c = await confirmQuote(await getOwnedQuote(quote.id, U1), quote.version + 1, viewer);
    expect(c.outcome).toBe("confirmed");
    qbo.invoiceLink = "https://intuit.com.evil.example/pay";
    const r = await checkoutQuote(quote.id, viewer, c.bundle.quote.version, FULL);
    expect(r.outcome).toBe("invoiced");
    if (r.outcome === "invoiced") expect(r.pay_url).toBeNull();
    expect(quoteRow(quote.id).checkout_status).toBe("failed");
  });

  it("outside Production the adapter is never constructed and nothing is locked, even with every flag on", async () => {
    const quote = await confirmedQuote([["website-creation", 1]]);
    for (const value of ["preview", "development", "test", undefined]) {
      if (value === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = value;
      const r = await checkoutQuote(quote.id, viewer, quote.version, { ...FULL, environmentAllowed: false });
      expect(r.outcome).toBe("blocked");
      if (r.outcome === "blocked") expect(codes(r.readiness)).toEqual(["checkout_unavailable_here"]);
      // A caller that lies about the environment still cannot reach QuickBooks: the adapter constructor re-checks.
      await expect(checkoutQuote(quote.id, viewer, quote.version, FULL)).rejects.toMatchObject({ name: "VinnieQuickBooksUnavailableError" });
      expect(qbo.requests).toHaveLength(0);
      expect(quoteRow(quote.id)).toMatchObject({ status: "confirmed", checkout_idempotency_key: null });
    }
    process.env.VERCEL_ENV = "production";
    env.qbProduction = false;
    await expect(checkoutQuote(quote.id, viewer, quote.version, FULL)).rejects.toMatchObject({ name: "VinnieQuickBooksUnavailableError" });
    expect(qbo.requests).toHaveLength(0);
  });
});

describe("reconcileQuoteStatus", () => {
  it("marks only the owner's invoiced quote paid after a read-only lookup, and throttles repeat checks", async () => {
    const quote = await confirmedQuote([["website-creation", 1]]);
    await checkoutQuote(quote.id, viewer, quote.version, FULL);
    const before = qbo.requests.length;
    let r = await reconcileQuoteStatus(quote.id, viewer);
    expect(r.outcome).toBe("unpaid");
    expect(qbo.requests.slice(before).every((x) => x.method === "GET")).toBe(true);
    const throttled = await reconcileQuoteStatus(quote.id, viewer);
    expect(throttled.outcome).toBe("throttled");
    qbo.invoices[0].Balance = 0;
    r = await reconcileQuoteStatus(quote.id, viewer, new Date(Date.now() + 120_000));
    expect(r.outcome).toBe("paid");
    expect(quoteRow(quote.id)).toMatchObject({ status: "paid", checkout_status: "paid", qb_invoice_status: "paid" });
    await expect(reconcileQuoteStatus(quote.id, { userId: U2, storefront: null })).rejects.toMatchObject({ code: "not_found" });
  });

  it("reports unavailable outside Production without contacting QuickBooks", async () => {
    const quote = await confirmedQuote([["website-creation", 1]]);
    await checkoutQuote(quote.id, viewer, quote.version, FULL);
    process.env.VERCEL_ENV = "preview";
    const before = qbo.requests.length;
    const r = await reconcileQuoteStatus(quote.id, viewer);
    expect(r.outcome).toBe("unavailable");
    expect(qbo.requests.length).toBe(before);
    expect(quoteRow(quote.id).status).toBe("invoiced");
  });
});
