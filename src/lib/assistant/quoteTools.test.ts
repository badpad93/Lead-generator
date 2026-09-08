import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseStub, type StubStore } from "./__testutils__/supabaseStub";

/**
 * The two quote tools through the real dispatcher: guest handling, the
 * write-tools flag, strict argument rejection, and the shape of what the
 * model sees (server prices only, no QuickBooks ids, no URLs).
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
const flags = { checkout: false };
vi.mock("@/lib/storefront/flags", () => ({ isStorefrontFlagEnabled: async (k: string) => (k === "assistant.checkout_enabled" ? flags.checkout : false) }));

import { dispatchTool } from "./tools/registry";
import type { ToolContext } from "./tools/context";

const U1 = "11111111-1111-4111-8111-000000000001";
const profile = { id: U1, full_name: "Jamie", role: "operator", coffee_access_enabled: true, storefront_tenant_id: null };
const guest: ToolContext = { threadId: "T", profile: null, storefront: null, writeToolsEnabled: true };
const userNoWrite: ToolContext = { threadId: "T", profile, storefront: null, writeToolsEnabled: false };
const user: ToolContext = { threadId: "T", profile, storefront: null, writeToolsEnabled: true };

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store.commerce_quotes = [];
  store.commerce_quote_lines = [];
  store.storefront_tenant_hidden_products = [];
  store.coffee_products = [];
  store.profiles = [{ id: U1, email: "j@example.com", full_name: "Jamie", phone: null, address: null, city: null, state: null, zip: null }];
  store.catalog_items = [
    { id: "c0000000-0000-4000-8000-00000000000c", catalog_key: "website-creation", name: "Website Creation", description: null, item_type: "other", unit_price: "500.00", sku: "WS0001", active: true, commerce_kind: "direct_checkout", pricing_basis: "fixed_unit", tax_treatment: "unset", required_agreement: null, qualification_program: null, financing_program: null, add_on_parent_key: null, equipment_ownership: null, qb_item_id: "SECRET-ITEM" },
    { id: "c0000000-0000-4000-8000-00000000000d", catalog_key: "financing-standard", name: "Financing", description: null, item_type: "financing", unit_price: "0.00", sku: null, active: true, commerce_kind: "application_required", pricing_basis: "no_charge", tax_treatment: "exempt", required_agreement: null, qualification_program: null, financing_program: "standard", add_on_parent_key: null, equipment_ownership: null, qb_item_id: null },
  ];
});

describe("get_quote", () => {
  it("tells guests to sign in and reports an empty state for a new customer", async () => {
    const g = await dispatchTool("get_quote", "{}", guest);
    expect(g.ok).toBe(true);
    expect((g.output as { status: string }).status).toBe("guest");
    const u = await dispatchTool("get_quote", "{}", userNoWrite);
    expect((u.output as { status: string }).status).toBe("empty");
  });
});

describe("update_quote", () => {
  it("is refused for guests and while write tools are disabled, without touching the database", async () => {
    const g = await dispatchTool("update_quote", JSON.stringify({ operations: [{ op: "add", ref: "website-creation", quantity: 1 }] }), guest);
    expect(g).toMatchObject({ ok: false, errorCode: "authentication_required", status: "refused" });
    const off = await dispatchTool("update_quote", JSON.stringify({ operations: [{ op: "add", ref: "website-creation", quantity: 1 }] }), userNoWrite);
    expect(off).toMatchObject({ ok: false, errorCode: "write_tools_disabled", status: "refused" });
    expect(store.commerce_quotes).toEqual([]);
  });

  it("rejects any price, total, customer, email, QuickBooks, or URL field at the schema", async () => {
    for (const extra of [{ price: 1 }, { total: 1 }, { customer_id: "x" }, { email: "a@b.c" }, { qb_invoice_id: "1" }, { url: "https://x" }, { unit_price: 5 }]) {
      const inOp = await dispatchTool("update_quote", JSON.stringify({ operations: [{ op: "add", ref: "website-creation", quantity: 1, ...extra }] }), user);
      expect(inOp.errorCode).toBe("invalid_arguments");
      const top = await dispatchTool("update_quote", JSON.stringify({ operations: [{ op: "add", ref: "website-creation", quantity: 1 }], ...extra }), user);
      expect(top.errorCode).toBe("invalid_arguments");
    }
    expect(store.commerce_quotes).toEqual([]);
  });

  it("adds a line with the server price and returns a view free of QuickBooks ids; financing is refused with a customer-safe message", async () => {
    const r = await dispatchTool("update_quote", JSON.stringify({ operations: [{ op: "add", ref: "website-creation", quantity: 2 }] }), user);
    expect(r.ok).toBe(true);
    const out = r.output as { status: string; quote: { lines: Array<{ description: string; unit_price: number; line_total: number }>; total: number; checkout: { available: boolean; blocked_reasons: Array<{ code: string }> } } };
    expect(out.quote.lines[0]).toMatchObject({ description: "Website Creation", unit_price: 500, line_total: 1000 });
    expect(out.quote.total).toBe(1000);
    expect(out.quote.checkout.available).toBe(false);
    expect(out.quote.checkout.blocked_reasons.map((b) => b.code)).toContain("checkout_disabled");
    expect(JSON.stringify(out)).not.toContain("SECRET-ITEM");
    expect(JSON.stringify(out)).not.toMatch(/https?:/);
    const fin = await dispatchTool("update_quote", JSON.stringify({ operations: [{ op: "add", ref: "financing-standard", quantity: 1 }] }), user);
    expect(fin).toMatchObject({ ok: false, errorCode: "quote_rejected", status: "refused" });
    expect((fin.output as { error: { message: string } }).error.message).toContain("never adds a charge");
  });
});
