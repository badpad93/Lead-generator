import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseStub, type StubStore } from "@/lib/assistant/__testutils__/supabaseStub";
import { createFakeQbo } from "./__testutils__/fakeQbo";

/**
 * Server-side agreement enforcement for Vinnie checkout, end to end:
 * catalog metadata → quote lines (freight inherits its parent) → gates →
 * lock → fresh re-read → the isolated adapter. QuickBooks is the in-memory
 * fake; every case asserts what reached it (usually nothing) and what the
 * quote row looks like afterwards. No network, no real database.
 */
const U1 = "11111111-1111-4111-8111-000000000001";
const U2 = "11111111-1111-4111-8111-000000000002";
const store: StubStore = {};
let quoteSeq = 0;
const stub = createSupabaseStub(store, [], {
  defaults: {
    commerce_quotes: () => ({ quote_number: `VQ-260909-${String(++quoteSeq).padStart(4, "0")}`, status: "draft", currency: "USD", version: 1, confirmed_version: null, confirmed_at: null, expires_at: null, financing_program: null, financing_status: "none", financing_application_id: null, financing_interest_at: null, agreement_state: "not_required", subtotal: 0, tax_status: "pre_tax", total: 0, qb_customer_id: null, qb_invoice_id: null, qb_invoice_doc_number: null, qb_invoice_status: "none", checkout_status: "none", checkout_url: null, checkout_idempotency_key: null, checkout_started_at: null, checkout_completed_at: null, status_reconciled_at: null, updated_at: new Date().toISOString() }),
    commerce_quote_lines: () => ({ staff_determination_by: null, staff_determination_at: null, staff_determination_note: null }),
  },
});
const hooks = { onFrom: null as null | ((table: string) => void) };
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => { hooks.onFrom?.(t); return stub.from(t); } } }));
vi.mock("@/lib/coffeePricing", () => ({ resolveCoffeeProductsPricing: async () => new Map() }));
/** The coffee gate answers in order, then falls back; `calls` proves the re-read. */
const coffee = { answers: [] as Array<string | null>, fallback: null as string | null, calls: 0 };
vi.mock("@/lib/placementAgreements", () => ({
  requireExecutedCoffeeSupplyAgreement: async () => {
    coffee.calls++;
    return coffee.answers.length > 0 ? coffee.answers.shift()! : coffee.fallback;
  },
}));
const qbo = createFakeQbo();
vi.mock("@/lib/quickbooks", () => ({ qbApi: (path: string, options?: RequestInit) => qbo.api(path, options), isQbProduction: () => true }));
const flags = { enabled: true, checkout: true, publicEnabled: true };
vi.mock("@/lib/assistant/flags", () => ({
  isAssistantEnabled: async () => flags.enabled,
  isAssistantWriteToolsEnabled: async () => true,
  isAssistantCheckoutEnabled: async () => flags.checkout,
  isAssistantCheckoutPublicEnabled: async () => flags.publicEnabled,
}));
const actor = { kind: "user" as "user" | "guest" | "anonymous", id: U1 };
vi.mock("@/lib/assistant/actor", () => ({
  resolveActor: async () => {
    if (actor.kind === "user") return { kind: "user", profile: { id: actor.id, full_name: "Jamie", role: "operator", coffee_access_enabled: true, storefront_tenant_id: null }, storefront: null };
    return actor.kind === "guest" ? { kind: "guest", token: "g" } : { kind: "anonymous" };
  },
}));
const admins = new Set<string>();
vi.mock("./adminAccess", () => ({ isVerifiedAdmin: async (id: string) => admins.has(id) }));

import { checkoutQuote, docNumberFor, type CheckoutAccess } from "./checkout";
import { cancelQuote, confirmQuote, getCurrentQuote, getOrCreateDraft, listLines, rebuildQuote } from "./quotes";
import { POST as checkoutPost } from "@/app/api/assistant/quote/checkout/route";

const FULL: CheckoutAccess = { checkoutEnabled: true, publicEnabled: true, isAdmin: false, environmentAllowed: true };
const ADMIN_ONLY: CheckoutAccess = { checkoutEnabled: true, publicEnabled: false, isAdmin: true, environmentAllowed: true };
const IDS = { cooler: "c0000000-0000-4000-8000-00000000000a", vfreight: "c0000000-0000-4000-8000-00000000000b", website: "c0000000-0000-4000-8000-00000000000c", brewer: "c0000000-0000-4000-8000-000000000010", cfreight: "c0000000-0000-4000-8000-000000000011" };
function catalogRow(id: string, key: string, name: string, spec: { price: number; kind: string } & Record<string, unknown>) {
  const { price, kind, ...extra } = spec;
  return { id, catalog_key: key, name, description: null, item_type: "other", unit_price: String(price), sku: null, active: true, commerce_kind: kind, pricing_basis: "fixed_unit", tax_treatment: "qbo_automated", required_agreement: null, qualification_program: null, financing_program: null, add_on_parent_key: null, equipment_ownership: null, qb_item_id: "1001", ...extra };
}
const machineAgreement = (extra: Record<string, unknown> = {}) => ({ id: "PA1", agreement_type: "machine_purchase", agreement_status: "signed", operator_email: "jamie@example.com", operator_id: U1, ...extra });
const viewerFor = (userId: string) => ({ userId, storefront: null });
const quoteRow = (id: string) => store.commerce_quotes.find((q) => q.id === id)!;
const codes = (r: { blocked_reasons: Array<{ code: string }> }) => r.blocked_reasons.map((x) => x.code);

async function confirmedQuote(userId: string, refs: Array<[string, number]>) {
  const viewer = viewerFor(userId);
  const current = await getCurrentQuote(userId);
  if (current && (current.status === "draft" || current.status === "confirmed")) await cancelQuote(current);
  const draft = await getOrCreateDraft(viewer, null);
  const b = await rebuildQuote(draft, refs.map(([ref, quantity]) => ({ op: "add" as const, ref, quantity })), viewer);
  const c = await confirmQuote(b.quote, b.quote.version, viewer);
  if (c.outcome !== "confirmed") throw new Error(`expected confirmed, got ${c.outcome}`);
  return c.bundle.quote;
}

const savedEnv = { VERCEL_ENV: process.env.VERCEL_ENV };
beforeEach(() => {
  process.env.VERCEL_ENV = "production";
  for (const k of Object.keys(store)) delete store[k];
  store.commerce_quotes = [];
  store.commerce_quote_lines = [];
  store.storefront_tenant_hidden_products = [];
  store.coffee_products = [];
  store.purchase_agreements = [];
  store.profiles = [
    { id: U1, email: "jamie@example.com", full_name: "Jamie", phone: "555", address: "1 Main St", city: "Austin", state: "TX", zip: "78701" },
    { id: U2, email: "other@example.com", full_name: "Other", phone: "555", address: "2 Main St", city: "Austin", state: "TX", zip: "78701" },
  ];
  store.catalog_items = [
    catalogRow(IDS.website, "website-creation", "Website Creation", { price: 500, kind: "direct_checkout" }),
    catalogRow(IDS.cooler, "vendera-ai-cooler", "VendEra AI Cooler", { price: 3700, kind: "agreement_required", required_agreement: "machine_purchase", equipment_ownership: "sold" }),
    catalogRow(IDS.vfreight, "vending-machine-freight", "Vending Machine Freight", { price: 500, kind: "conditional_add_on", add_on_parent_key: "vendera-ai-cooler" }),
    catalogRow(IDS.brewer, "flavia-c600-brewer", "Flavia C600 Brewer", { price: 0, kind: "agreement_required", required_agreement: "coffee_supply", equipment_ownership: "company_owned_loan" }),
    catalogRow(IDS.cfreight, "coffee-machine-freight", "Coffee Machine Freight", { price: 99.99, kind: "conditional_add_on", add_on_parent_key: "flavia-c600-brewer" }),
  ];
  coffee.answers = [];
  coffee.fallback = null;
  coffee.calls = 0;
  hooks.onFrom = null;
  admins.clear();
  flags.enabled = true;
  flags.checkout = true;
  flags.publicEnabled = true;
  actor.kind = "user";
  actor.id = U1;
  qbo.reset();
});
afterEach(() => {
  if (savedEnv.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = savedEnv.VERCEL_ENV;
});

function expectUntouched(quoteId: string, checkoutStatus: "none" | "blocked") {
  expect(qbo.requests).toHaveLength(0);
  expect(qbo.invoices).toHaveLength(0);
  expect(quoteRow(quoteId)).toMatchObject({ status: "confirmed", checkout_status: checkoutStatus, qb_invoice_id: null });
}

describe("machine purchase agreement (vendera-ai-cooler + inherited freight)", () => {
  it("valid: one signed agreement owned by the buyer invoices the cooler and its freight with the deterministic DocNumber", async () => {
    store.purchase_agreements = [machineAgreement()];
    const quote = await confirmedQuote(U1, [["vendera-ai-cooler", 2]]);
    const lines = await listLines(quote.id);
    expect(lines.map((l) => [l.catalog_key, l.quantity, l.is_auto_add_on])).toEqual([["vendera-ai-cooler", 2, false], ["vending-machine-freight", 2, true]]);
    const r = await checkoutQuote(quote.id, viewerFor(U1), quote.version, FULL);
    expect(r.outcome).toBe("invoiced");
    expect(qbo.invoices).toHaveLength(1);
    expect(qbo.invoices[0].DocNumber).toBe(docNumberFor(quote));
    expect(qbo.invoices[0].Line).toHaveLength(2);
    expect(quoteRow(quote.id)).toMatchObject({ status: "invoiced", qb_invoice_id: qbo.invoices[0].Id });
  });

  it("missing: no agreement → blocked, nothing locked, nothing sent", async () => {
    const quote = await confirmedQuote(U1, [["vendera-ai-cooler", 1]]);
    const r = await checkoutQuote(quote.id, viewerFor(U1), quote.version, FULL);
    expect(r.outcome).toBe("blocked");
    if (r.outcome === "blocked") expect(codes(r.readiness)).toEqual(["agreement_missing"]);
    expectUntouched(quote.id, "blocked");
    expect(quoteRow(quote.id).checkout_idempotency_key).toBeNull();
  });

  it("pending, cancelled and expired agreements never authorise, even when owned by the buyer", async () => {
    const quote = await confirmedQuote(U1, [["vendera-ai-cooler", 1]]);
    for (const status of ["draft", "generated", "sent", "viewed", "partially_signed", "cancelled", "expired"]) {
      store.purchase_agreements = [machineAgreement({ agreement_status: status })];
      const r = await checkoutQuote(quote.id, viewerFor(U1), quote.version, FULL);
      expect(r.outcome, status).toBe("blocked");
      if (r.outcome === "blocked") expect(codes(r.readiness), status).toEqual(["agreement_missing"]);
    }
    expectUntouched(quote.id, "blocked");
  });

  it("wrong user: another customer's signed agreement cannot authorise, and the response does not reveal that it exists", async () => {
    const quote = await confirmedQuote(U1, [["vendera-ai-cooler", 1]]);
    // Owned by U2, even though it carries U1's email address: ownership is the id relationship only.
    store.purchase_agreements = [machineAgreement({ operator_id: U2, operator_email: "jamie@example.com" })];
    const r = await checkoutQuote(quote.id, viewerFor(U1), quote.version, FULL);
    expect(r.outcome).toBe("blocked");
    if (r.outcome === "blocked") {
      expect(codes(r.readiness)).toEqual(["agreement_missing"]);
      expect(JSON.stringify(r.readiness)).not.toMatch(/PA1|found|exists|other@|jamie@/i);
    }
    expectUntouched(quote.id, "blocked");
  });

  it("an email-only match never authorises: it blocks with a staff-review reason", async () => {
    const quote = await confirmedQuote(U1, [["vendera-ai-cooler", 1]]);
    store.purchase_agreements = [machineAgreement({ operator_id: null, operator_email: "JAMIE@example.com" })];
    const r = await checkoutQuote(quote.id, viewerFor(U1), quote.version, FULL);
    expect(r.outcome).toBe("blocked");
    if (r.outcome === "blocked") expect(codes(r.readiness)).toEqual(["agreement_unverified"]);
    expectUntouched(quote.id, "blocked");
  });

  it("race: an agreement cancelled after the readiness check but before the lock is caught by the re-read; no request is sent and the lock is released", async () => {
    store.purchase_agreements = [machineAgreement()];
    const quote = await confirmedQuote(U1, [["vendera-ai-cooler", 1]]);
    let reads = 0;
    hooks.onFrom = (table) => {
      if (table === "purchase_agreements" && ++reads === 2) store.purchase_agreements[0].agreement_status = "cancelled";
    };
    const r = await checkoutQuote(quote.id, viewerFor(U1), quote.version, FULL);
    // 1: assessment (found). 2: post-lock re-read (now cancelled, none owned). 3: the same re-read's email fallback.
    expect(reads).toBe(3);
    expect(r.outcome).toBe("blocked");
    if (r.outcome === "blocked") expect(codes(r.readiness)).toEqual(["agreement_missing"]);
    expectUntouched(quote.id, "blocked");
    // The lock was taken and released: the same version can still be checked out once the agreement is valid again.
    hooks.onFrom = null;
    store.purchase_agreements[0].agreement_status = "signed";
    const ok = await checkoutQuote(quote.id, viewerFor(U1), quote.version, FULL);
    expect(ok.outcome).toBe("invoiced");
    expect(qbo.invoices).toHaveLength(1);
    // Idempotent re-entry still returns the same invoice instead of a second one.
    const again = await checkoutQuote(quote.id, viewerFor(U1), quote.version, FULL);
    expect(again.outcome).toBe("invoiced");
    expect(qbo.invoices).toHaveLength(1);
    expect(qbo.requests.filter((q) => q.method === "POST" && q.path === "/invoice")).toHaveLength(1);
  });
});

describe("coffee supply agreement (flavia-c600-brewer + inherited freight)", () => {
  it("valid: a fully executed agreement invoices the brewer's freight line under the same gate", async () => {
    const quote = await confirmedQuote(U1, [["flavia-c600-brewer", 1]]);
    const r = await checkoutQuote(quote.id, viewerFor(U1), quote.version, FULL);
    expect(r.outcome).toBe("invoiced");
    expect(coffee.calls).toBe(2); // assessment + the post-lock re-read
    expect(qbo.invoices[0].Line).toHaveLength(2);
  });

  it("missing, pending, revoked, declined: any non-executed state blocks before anything is sent", async () => {
    const quote = await confirmedQuote(U1, [["flavia-c600-brewer", 1]]);
    for (const message of [
      "Sign the Equipment Loan & Beverage Supply Agreement to place orders.",
      "Your Equipment Loan & Beverage Supply Agreement is awaiting Apex AI countersignature.",
      "Equipment Loan & Beverage Supply Agreement not fully executed.",
      "Your Equipment Loan & Beverage Supply Agreement was declined. Contact support.",
    ]) {
      coffee.fallback = message;
      const r = await checkoutQuote(quote.id, viewerFor(U1), quote.version, FULL);
      expect(r.outcome).toBe("blocked");
      if (r.outcome === "blocked") expect(r.readiness.blocked_reasons).toEqual([{ code: "agreement_missing", message }]);
    }
    expectUntouched(quote.id, "blocked");
  });

  it("race: revoked between the readiness check and the lock → the re-read blocks, releases the lock, sends nothing", async () => {
    const quote = await confirmedQuote(U1, [["flavia-c600-brewer", 1]]);
    coffee.answers = [null, "Equipment Loan & Beverage Supply Agreement not fully executed."];
    const r = await checkoutQuote(quote.id, viewerFor(U1), quote.version, FULL);
    expect(coffee.calls).toBe(2);
    expect(r.outcome).toBe("blocked");
    if (r.outcome === "blocked") expect(codes(r.readiness)).toEqual(["agreement_missing"]);
    expectUntouched(quote.id, "blocked");
  });
});

describe("who may ask", () => {
  const post = (body: unknown) => checkoutPost(new NextRequest("http://localhost/api/assistant/quote/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("guest and anonymous callers are refused before any quote, agreement, or QuickBooks work", async () => {
    store.purchase_agreements = [machineAgreement()];
    const quote = await confirmedQuote(U1, [["vendera-ai-cooler", 1]]);
    for (const kind of ["guest", "anonymous"] as const) {
      actor.kind = kind;
      const res = await post({ quote_id: quote.id, version: quote.version, confirm: true });
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("authentication_required");
    }
    expectUntouched(quote.id, "none");
  });

  it("administrator canary: with public checkout off, a verified administrator may check out only their own quote and only with their own valid agreement", async () => {
    flags.publicEnabled = false;
    const mine = await confirmedQuote(U1, [["vendera-ai-cooler", 1]]);
    const theirs = await confirmedQuote(U2, [["vendera-ai-cooler", 1]]);
    store.purchase_agreements = [machineAgreement({ id: "PA2", operator_id: U2, operator_email: "other@example.com" })];
    // Not an administrator: refused by the rollout gate before ownership or agreements are consulted.
    let res = await post({ quote_id: mine.id, version: mine.version, confirm: true });
    expect((await res.json()).error.code).toBe("checkout_disabled");
    admins.add(U1);
    // Administrator, own quote, but the only signed agreement belongs to U2.
    res = await post({ quote_id: mine.id, version: mine.version, confirm: true });
    expect(res.status).toBe(409);
    expect((await res.json()).checkout.blocked_reasons.map((r: { code: string }) => r.code)).toEqual(["agreement_missing"]);
    // Administrator status never reaches another customer's quote.
    res = await post({ quote_id: theirs.id, version: theirs.version, confirm: true });
    expect((await res.json()).error.code).toBe("not_found");
    expectUntouched(mine.id, "blocked");
    expectUntouched(theirs.id, "none");
    // Own valid agreement: the canary transaction goes through.
    store.purchase_agreements.push(machineAgreement());
    res = await post({ quote_id: mine.id, version: mine.version, confirm: true });
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("invoiced");
    expect(qbo.invoices).toHaveLength(1);
  });

  it("the request body cannot supply an agreement, a role, or metadata: extra keys are rejected outright", async () => {
    store.purchase_agreements = [machineAgreement({ operator_id: U2 })];
    const quote = await confirmedQuote(U1, [["vendera-ai-cooler", 1]]);
    for (const extra of [{ agreement_id: "PA1" }, { role: "admin" }, { operator_id: U2 }, { user_id: U2 }, { metadata: { admin: true } }]) {
      const res = await post({ quote_id: quote.id, version: quote.version, confirm: true, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(422);
      expect((await res.json()).error.code).toBe("invalid_operation");
    }
    expectUntouched(quote.id, "none");
  });

  it("administrator status is enforced at the library level too: the canary access still requires the buyer's own agreement", async () => {
    const quote = await confirmedQuote(U1, [["vendera-ai-cooler", 1]]);
    const blocked = await checkoutQuote(quote.id, viewerFor(U1), quote.version, ADMIN_ONLY);
    expect(blocked.outcome).toBe("blocked");
    expectUntouched(quote.id, "blocked");
    store.purchase_agreements = [machineAgreement()];
    const ok = await checkoutQuote(quote.id, viewerFor(U1), quote.version, ADMIN_ONLY);
    expect(ok.outcome).toBe("invoiced");
  });
});
