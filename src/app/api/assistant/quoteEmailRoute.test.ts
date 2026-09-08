import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseStub, type StubStore } from "@/lib/assistant/__testutils__/supabaseStub";

/**
 * POST /api/assistant/quote/email: the recipient is the signed-in
 * customer's profile email, never the body; only the owner's confirmed
 * or invoiced quote can be emailed; the write flag and sign-in gate it.
 */
const store: StubStore = {};
let seq = 0;
const stub = createSupabaseStub(store, [], {
  defaults: {
    commerce_quotes: () => ({ quote_number: `VQ-260908-${String(++seq).padStart(4, "0")}`, status: "draft", currency: "USD", version: 1, confirmed_version: null, confirmed_at: null, expires_at: null, financing_program: null, financing_status: "none", financing_application_id: null, financing_interest_at: null, agreement_state: "not_required", subtotal: 0, tax_status: "pre_tax", total: 0, qb_customer_id: null, qb_invoice_id: null, qb_invoice_doc_number: null, qb_invoice_status: "none", checkout_status: "none", checkout_url: null, checkout_idempotency_key: null, checkout_started_at: null, checkout_completed_at: null, updated_at: new Date().toISOString() }),
    commerce_quote_lines: () => ({ staff_determination_by: null, staff_determination_at: null, staff_determination_note: null }),
  },
});
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));
vi.mock("@/lib/coffeePricing", () => ({ resolveCoffeeProductsPricing: async () => new Map() }));
vi.mock("@/lib/placementAgreements", () => ({ requireExecutedCoffeeSupplyAgreement: async () => null }));
const flags = { enabled: true, write: true, checkout: false };
vi.mock("@/lib/assistant/flags", () => ({
  isAssistantEnabled: async () => flags.enabled,
  isAssistantWriteToolsEnabled: async () => flags.write,
  isAssistantCheckoutEnabled: async () => flags.checkout,
  isAssistantCheckoutPublicEnabled: async () => false,
}));
const actor: { kind: "user" | "guest"; id: string } = { kind: "user", id: "" };
vi.mock("@/lib/assistant/actor", () => ({
  resolveActor: async () => (actor.kind === "user" ? { kind: "user", profile: { id: actor.id, full_name: "Jamie", role: "operator", coffee_access_enabled: true, storefront_tenant_id: null }, storefront: null } : { kind: "guest", token: "g" }),
}));
const sent: Array<Record<string, unknown>> = [];
vi.mock("@/lib/resendClient", () => ({ getResendClient: () => ({ emails: { send: async (m: Record<string, unknown>) => { sent.push(m); return { data: { id: "em" }, error: null }; } } }) }));

import { POST } from "./quote/email/route";
import { confirmQuote, getOrCreateDraft, rebuildQuote } from "@/lib/commerce/quotes";

const U1 = "11111111-1111-4111-8111-000000000001";
const U2 = "11111111-1111-4111-8111-000000000002";
const WEB = "c0000000-0000-4000-8000-00000000000c";
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/assistant/quote/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

async function confirmedFor(userId: string) {
  const viewer = { userId, storefront: null };
  const draft = await getOrCreateDraft(viewer, null);
  const b = await rebuildQuote(draft, [{ op: "add", ref: "website-creation", quantity: 1 }], viewer);
  const c = await confirmQuote(b.quote, b.quote.version, viewer);
  if (c.outcome !== "confirmed") throw new Error("expected confirmed");
  return c.bundle.quote;
}

beforeEach(() => {
  process.env.ASSISTANT_HASH_SECRET = "test-secret";
  for (const k of Object.keys(store)) delete store[k];
  store.commerce_quotes = [];
  store.commerce_quote_lines = [];
  store.storefront_tenant_hidden_products = [];
  store.coffee_products = [];
  store.purchase_agreements = [];
  store.profiles = [
    { id: U1, email: "jamie@example.com", full_name: "Jamie", phone: null, address: null, city: null, state: null, zip: null },
    { id: U2, email: "", full_name: "Other", phone: null, address: null, city: null, state: null, zip: null },
  ];
  store.catalog_items = [{ id: WEB, catalog_key: "website-creation", name: "Website Creation", description: null, item_type: "other", unit_price: "500", sku: "WS0001", active: true, commerce_kind: "direct_checkout", pricing_basis: "fixed_unit", tax_treatment: "qbo_automated", required_agreement: null, qualification_program: null, financing_program: null, add_on_parent_key: null, equipment_ownership: null, qb_item_id: null }];
  sent.length = 0;
  flags.enabled = true;
  flags.write = true;
  actor.kind = "user";
  actor.id = U1;
});

describe("POST /api/assistant/quote/email", () => {
  it("emails the owner's confirmed quote to the profile email, ignoring any address in the body", async () => {
    const q = await confirmedFor(U1);
    const res = await post({ quote_id: q.id, to: "attacker@example.com" });
    expect(res.status).toBe(422);
    const ok = await post({ quote_id: q.id });
    expect(ok.status).toBe(200);
    const json = await ok.json();
    expect(json.sent_to).toBe("jamie@example.com");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("jamie@example.com");
    expect(String(sent[0].html)).toContain(q.quote_number);
    expect(String(sent[0].html)).toContain("$500.00");
    expect(String(sent[0].html)).not.toContain("financing application");
    expect(JSON.stringify(json.quote)).not.toMatch(/qb_|checkout_url/);
  });
  it("includes the financing link once interest is recorded", async () => {
    const q = await confirmedFor(U1);
    store.commerce_quotes[0].financing_program = "standard";
    store.commerce_quotes[0].financing_status = "interested";
    const res = await post({ quote_id: q.id });
    expect(res.status).toBe(200);
    expect(String(sent[0].html)).toContain(`/financing?quote=${q.id}.`);
  });
  it("refuses drafts, foreign quotes, guests, and the write flag off; sends nothing", async () => {
    const viewer = { userId: U1, storefront: null };
    const draft = await getOrCreateDraft(viewer, null);
    expect((await post({ quote_id: draft.id })).status).toBe(422);
    const q = await confirmedFor(U1);
    actor.id = U2;
    expect((await post({ quote_id: q.id })).status).toBe(404);
    actor.kind = "guest";
    expect((await post({ quote_id: q.id })).status).toBe(401);
    actor.kind = "user";
    actor.id = U1;
    flags.write = false;
    expect((await post({ quote_id: q.id })).status).toBe(403);
    flags.write = true;
    flags.enabled = false;
    expect((await post({ quote_id: q.id })).status).toBe(404);
    expect(sent).toHaveLength(0);
  });
  it("refuses when the profile has no email address", async () => {
    actor.id = U2;
    const q = await confirmedFor(U2);
    const res = await post({ quote_id: q.id });
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/email address/);
    expect(sent).toHaveLength(0);
  });
});
