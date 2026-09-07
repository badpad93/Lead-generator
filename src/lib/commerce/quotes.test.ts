import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseStub, type StubStore } from "@/lib/assistant/__testutils__/supabaseStub";

/**
 * Quote engine security and correctness: ownership, guest isolation,
 * quantity rules, automatic freight, canonical pricing, stale-price
 * revalidation, confirmation/expiry, the 10/10/10 deposit waiver, and
 * the migration's grant/RLS posture. Supabase and the pricing resolver
 * are stubbed; nothing touches a network.
 */
const store: StubStore = {};
let quoteSeq = 0;
const stub = createSupabaseStub(store, [], {
  defaults: {
    commerce_quotes: () => ({ quote_number: `VQ-260907-${String(++quoteSeq).padStart(4, "0")}`, status: "draft", currency: "USD", version: 1, confirmed_version: null, confirmed_at: null, expires_at: null, financing_program: null, financing_status: "none", financing_application_id: null, financing_interest_at: null, agreement_state: "not_required", subtotal: 0, tax_status: "pre_tax", total: 0, qb_customer_id: null, qb_invoice_id: null, qb_invoice_doc_number: null, qb_invoice_status: "none", checkout_status: "none", checkout_url: null, checkout_idempotency_key: null, checkout_started_at: null, checkout_completed_at: null, updated_at: new Date().toISOString() }),
    commerce_quote_lines: () => ({ staff_determination_by: null, staff_determination_at: null, staff_determination_note: null }),
  },
});
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));
vi.mock("@/lib/coffeePricing", () => ({
  resolveCoffeeProductsPricing: async (args: { productIds: string[]; userId?: string | null; storefront?: { tenantId: string } | null }) => {
    const out = new Map();
    for (const id of args.productIds) {
      const base = { product_id: id, pricing_tier_id: "T1", tier_key: "tier_1", tier_name: "Tier 1", currency: "USD", shipping_cost: 2.5 };
      if (args.storefront) out.set(id, { ...base, price: 39, fallback_used: false, fallback_reason: null, storefront: { error: null } });
      else out.set(id, { ...base, price: 41, fallback_used: false, fallback_reason: null });
    }
    return out;
  },
}));

import { cancelQuote, confirmQuote, getCurrentQuote, getOrCreateDraft, getOwnedQuote, listLines, rebuildQuote, recordFinancingInterest, revalidateQuote } from "./quotes";
import { QuoteError } from "./quoteTypes";
import { toQuoteView } from "./quoteView";
import { findProhibitedKey } from "@/lib/assistant/publicShapes";

const U1 = "11111111-1111-4111-8111-000000000001";
const U2 = "11111111-1111-4111-8111-000000000002";
const viewer = { userId: U1, storefront: null };
const IDS = { cooler: "c0000000-0000-4000-8000-00000000000a", vfreight: "c0000000-0000-4000-8000-00000000000b", website: "c0000000-0000-4000-8000-00000000000c", fin: "c0000000-0000-4000-8000-00000000000d", deposit: "c0000000-0000-4000-8000-00000000000e", ttt: "c0000000-0000-4000-8000-00000000000f", brewer: "c0000000-0000-4000-8000-000000000010", cfreight: "c0000000-0000-4000-8000-000000000011", retired: "c0000000-0000-4000-8000-000000000012", coffee: "d0000000-0000-4000-8000-000000000001" };

function catalogRow(id: string, key: string, name: string, spec: { price: number; kind: string } & Record<string, unknown>) {
  const { price, kind, ...extra } = spec;
  return { id, catalog_key: key, name, description: null, item_type: "other", unit_price: String(price), sku: null, active: true, commerce_kind: kind, pricing_basis: "fixed_unit", tax_treatment: "unset", required_agreement: null, qualification_program: null, financing_program: null, add_on_parent_key: null, equipment_ownership: null, qb_item_id: null, ...extra };
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store.commerce_quotes = [];
  store.commerce_quote_lines = [];
  store.storefront_tenant_hidden_products = [];
  store.coffee_products = [{ id: IDS.coffee, name: "House Blend", sku: "CB-1", active: true, stock_status: "in_stock" }];
  store.catalog_items = [
    catalogRow(IDS.cooler, "vendera-ai-cooler", "VendEra AI Cooler", { price: 3700, kind: "agreement_required", required_agreement: "machine_purchase", equipment_ownership: "sold" }),
    catalogRow(IDS.vfreight, "vending-machine-freight", "Vending Machine Freight", { price: 500, kind: "conditional_add_on", add_on_parent_key: "vendera-ai-cooler" }),
    catalogRow(IDS.website, "website-creation", "Website Creation", { price: 500, kind: "direct_checkout" }),
    catalogRow(IDS.fin, "financing-standard", "Financing", { price: 0, kind: "application_required", pricing_basis: "no_charge", financing_program: "standard" }),
    catalogRow(IDS.deposit, "location-service-deposit", "Location Services Deposit", { price: 100, kind: "deposit_only", pricing_basis: "per_location" }),
    catalogRow(IDS.ttt, "location-service-10-10-10", "Location Services 10/10/10", { price: 400, kind: "qualification_required", qualification_program: "ten_ten_ten" }),
    catalogRow(IDS.brewer, "flavia-c600-brewer", "Flavia C600 Brewer", { price: 0, kind: "agreement_required", required_agreement: "coffee_supply", equipment_ownership: "company_owned_loan" }),
    catalogRow(IDS.cfreight, "coffee-machine-freight", "Coffee Machine Freight", { price: 99.99, kind: "conditional_add_on", add_on_parent_key: "flavia-c600-brewer" }),
    catalogRow(IDS.retired, "retired-item", "Retired", { price: 5, kind: "direct_checkout", active: false }),
  ];
});

const lineMap = (lines: Array<{ description: string; quantity: number; line_total: number }>) => Object.fromEntries(lines.map((l) => [l.description, [l.quantity, l.line_total]]));

describe("ownership and isolation", () => {
  it("a quote is only readable by its owner; a foreign id is indistinguishable from a missing one", async () => {
    const q = await getOrCreateDraft(viewer, null);
    expect(q.user_id).toBe(U1);
    await expect(getOwnedQuote(q.id, U2)).rejects.toMatchObject({ code: "not_found" });
    await expect(getOwnedQuote("not-a-uuid", U1)).rejects.toMatchObject({ code: "not_found" });
    expect((await getOwnedQuote(q.id, U1)).id).toBe(q.id);
    expect(await getCurrentQuote(U2)).toBeNull();
  });

  it("the customer-facing view never contains QuickBooks ids, checkout URLs, or prohibited keys", async () => {
    const q = await getOrCreateDraft(viewer, null);
    store.commerce_quotes[0].qb_invoice_id = "QBO-INV-9";
    store.commerce_quotes[0].checkout_url = "https://connect.intuit.com/pay/9";
    const bundle = await rebuildQuote(await getOwnedQuote(q.id, U1), [{ op: "add", ref: "website-creation", quantity: 1 }], viewer);
    const view = toQuoteView(bundle.quote, bundle.lines, bundle.changes, { available: false, blocked_reasons: [], location_intake_quantity: 0 });
    const json = JSON.stringify(view);
    expect(json).not.toContain("QBO-INV-9");
    expect(json).not.toContain("intuit.com");
    expect(findProhibitedKey(view)).toBeNull();
    expect(view.tax_note).toContain("QuickBooks invoice");
  });
});

describe("operations, quantities, and automatic freight", () => {
  it("adding a VendEra cooler adds one freight line per unit, follows quantity changes, and disappears with its parent", async () => {
    const q = await getOrCreateDraft(viewer, null);
    let b = await rebuildQuote(q, [{ op: "add", ref: "vendera-ai-cooler", quantity: 2 }], viewer);
    expect(lineMap(b.lines)).toEqual({ "VendEra AI Cooler": [2, 7400], "Vending Machine Freight": [2, 1000] });
    expect(b.lines.find((l) => l.is_auto_add_on)?.parent_line_id).toBe(b.lines.find((l) => !l.is_auto_add_on)?.id);
    expect(b.quote.subtotal).toBe(8400);
    b = await rebuildQuote(b.quote, [{ op: "set_quantity", ref: IDS.cooler, quantity: 3 }], viewer);
    expect(lineMap(b.lines)["Vending Machine Freight"]).toEqual([3, 1500]);
    b = await rebuildQuote(b.quote, [{ op: "remove", ref: "vendera-ai-cooler", quantity: null }], viewer);
    expect(b.lines).toEqual([]);
    expect(b.quote.subtotal).toBe(0);
  });

  it("the Flavia C600 costs $0 but carries $99.99 freight per brewer", async () => {
    const b = await rebuildQuote(await getOrCreateDraft(viewer, null), [{ op: "add", ref: "flavia-c600-brewer", quantity: 3 }], viewer);
    expect(lineMap(b.lines)).toEqual({ "Flavia C600 Brewer": [3, 0], "Coffee Machine Freight": [3, 299.97] });
  });

  it("rejects financing, add-on, inactive, and unknown refs as lines, and enforces quantity bounds", async () => {
    const q = await getOrCreateDraft(viewer, null);
    await expect(rebuildQuote(q, [{ op: "add", ref: "financing-standard", quantity: 1 }], viewer)).rejects.toMatchObject({ code: "item_not_quotable", details: { reason: "application_required" } });
    await expect(rebuildQuote(q, [{ op: "add", ref: "vending-machine-freight", quantity: 1 }], viewer)).rejects.toMatchObject({ code: "item_not_quotable" });
    await expect(rebuildQuote(q, [{ op: "add", ref: "retired-item", quantity: 1 }], viewer)).rejects.toMatchObject({ code: "item_not_quotable", details: { reason: "inactive" } });
    await expect(rebuildQuote(q, [{ op: "add", ref: "nope", quantity: 1 }], viewer)).rejects.toMatchObject({ code: "not_found" });
    for (const bad of [0, 1000, 1.5, -1]) {
      await expect(rebuildQuote(q, [{ op: "add", ref: "website-creation", quantity: bad }], viewer)).rejects.toBeInstanceOf(QuoteError);
    }
    expect(await listLines(q.id)).toEqual([]);
  });

  it("coffee lines use the canonical resolver with customer-specific pricing", async () => {
    const user = await rebuildQuote(await getOrCreateDraft(viewer, null), [{ op: "add", ref: IDS.coffee, quantity: 2 }], viewer);
    expect(user.lines[0]).toMatchObject({ source_type: "coffee_product", unit_price: 41, line_total: 82, pricing_basis: "coffee_tier" });
    const sfViewer = { userId: U2, storefront: { tenantId: "TEN", customerProfileId: U2 } };
    const sf = await rebuildQuote(await getOrCreateDraft(sfViewer, null), [{ op: "add", ref: IDS.coffee, quantity: 1 }], sfViewer);
    expect(sf.lines[0]).toMatchObject({ unit_price: 39, pricing_basis: "coffee_storefront" });
    store.storefront_tenant_hidden_products = [{ tenant_id: "TEN", product_id: IDS.coffee }];
    const hidden = await revalidateQuote(sf.quote, sfViewer);
    expect(hidden.lines[0].validation_status).toBe("inactive");
    expect(hidden.changes.map((c) => c.kind)).toContain("inactive");
  });
});

describe("confirmation, stale prices, and expiry", () => {
  it("confirms at the seen version with a seven-day expiry; a version mismatch is refused", async () => {
    const b = await rebuildQuote(await getOrCreateDraft(viewer, null), [{ op: "add", ref: "website-creation", quantity: 1 }], viewer);
    await expect(confirmQuote(b.quote, b.quote.version - 1, viewer)).rejects.toMatchObject({ code: "version_mismatch" });
    const c = await confirmQuote(b.quote, b.quote.version, viewer);
    expect(c.outcome).toBe("confirmed");
    const q = c.bundle.quote;
    expect(q.status).toBe("confirmed");
    expect(q.confirmed_version).toBe(q.version);
    expect(new Date(q.expires_at!).getTime() - new Date(q.confirmed_at!).getTime()).toBe(7 * 86_400_000);
  });

  it("a changed public price is surfaced, bumps the version, drops the confirmation, and blocks silent charging", async () => {
    const b = await rebuildQuote(await getOrCreateDraft(viewer, null), [{ op: "add", ref: "website-creation", quantity: 1 }], viewer);
    const c = await confirmQuote(b.quote, b.quote.version, viewer);
    expect(c.outcome).toBe("confirmed");
    store.catalog_items.find((r) => r.id === IDS.website)!.unit_price = "550.00";
    const again = await confirmQuote(c.bundle.quote, c.bundle.quote.version, viewer);
    expect(again.outcome).toBe("changed");
    expect(again.bundle.changes).toEqual([{ kind: "price_changed", description: "Website Creation", previous: 500, current: 550 }]);
    expect(again.bundle.quote.status).toBe("draft");
    expect(again.bundle.quote.version).toBe(c.bundle.quote.version + 1);
    expect(again.bundle.quote.confirmed_at).toBeNull();
    expect(again.bundle.quote.total).toBe(550);
  });

  it("an expired confirmation flips to expired on read and cannot be edited; the next draft is a new quote", async () => {
    const b = await rebuildQuote(await getOrCreateDraft(viewer, null), [{ op: "add", ref: "website-creation", quantity: 1 }], viewer);
    const c = await confirmQuote(b.quote, b.quote.version, viewer);
    store.commerce_quotes[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const read = await getOwnedQuote(c.bundle.quote.id, U1);
    expect(read.status).toBe("expired");
    await expect(rebuildQuote(read, [], viewer)).rejects.toMatchObject({ code: "quote_locked" });
    const fresh = await getOrCreateDraft(viewer, null);
    expect(fresh.id).not.toBe(read.id);
  });

  it("an invoiced quote is locked, and cancelling an editable one starts fresh", async () => {
    const q = await getOrCreateDraft(viewer, null);
    store.commerce_quotes[0].status = "invoiced";
    await expect(rebuildQuote({ ...q, status: "invoiced" }, [], viewer)).rejects.toMatchObject({ code: "quote_locked" });
    const next = await getOrCreateDraft(viewer, null);
    expect(next.id).not.toBe(q.id);
    await cancelQuote(next);
    expect(store.commerce_quotes.find((r) => r.id === next.id)?.status).toBe("cancelled");
  });
});

describe("location services and financing on a quote", () => {
  it("deposit lines are per-location intake lines; tiers need a staff determination", async () => {
    const b = await rebuildQuote(await getOrCreateDraft(viewer, null), [{ op: "add", ref: "location-service-deposit", quantity: 4 }, { op: "add", ref: "location-service-10-10-10", quantity: 4 }], viewer);
    const m = Object.fromEntries(b.lines.map((l) => [l.description, l]));
    expect(m["Location Services Deposit"]).toMatchObject({ quantity: 4, line_total: 400, pricing_basis: "catalog_per_location", validation_status: "location_intake" });
    expect(m["Location Services 10/10/10"]).toMatchObject({ validation_status: "requires_qualification" });
  });

  it("a recorded 10/10/10 approval waives the ordinary deposit and is reported as a change", async () => {
    const b = await rebuildQuote(await getOrCreateDraft(viewer, null), [{ op: "add", ref: "location-service-deposit", quantity: 2 }, { op: "add", ref: "location-service-10-10-10", quantity: 2 }], viewer);
    const ttt = store.commerce_quote_lines.find((l) => l.description === "Location Services 10/10/10")!;
    ttt.staff_determination_at = new Date().toISOString();
    ttt.staff_determination_by = "22222222-2222-4222-8222-000000000001";
    const r = await revalidateQuote(b.quote, viewer);
    expect(r.lines.map((l) => l.description)).toEqual(["Location Services 10/10/10"]);
    expect(r.lines[0].validation_status).toBe("valid");
    expect(r.changes).toEqual([{ kind: "deposit_waived", description: "Location Services Deposit", previous: 200, current: 0 }]);
    expect(r.quote.total).toBe(800);
  });

  it("financing interest is metadata only: no line, no total change, no approval", async () => {
    const b = await rebuildQuote(await getOrCreateDraft(viewer, null), [{ op: "add", ref: "vendera-ai-cooler", quantity: 1 }], viewer);
    const q = await recordFinancingInterest(b.quote, "ten_ten_ten");
    expect(q.financing_program).toBe("ten_ten_ten");
    expect(q.financing_status).toBe("interested");
    expect(q.total).toBe(4200);
    expect((await listLines(q.id)).length).toBe(2);
    const view = toQuoteView(q, await listLines(q.id), [], { available: false, blocked_reasons: [], location_intake_quantity: 0 });
    expect(view.notices.join(" ")).toContain("not an approval");
  });
});

describe("migration 20260907221654 posture", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "20260907221654_commerce_quotes.sql"), "utf8");
  it("creates the three tables with grants, RLS, and auth.uid()-scoped policies only", () => {
    for (const t of ["commerce_quotes", "commerce_quote_lines", "commerce_listing_inquiries"]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    }
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.commerce_quotes, public\.commerce_quote_lines, public\.commerce_listing_inquiries FROM anon;/);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE [^;]*FROM authenticated;/);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.commerce_quotes, public\.commerce_quote_lines, public\.commerce_listing_inquiries TO authenticated;/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)/);
    expect(sql).not.toMatch(/TO PUBLIC/i);
    const authenticatedPolicies = sql.match(/CREATE POLICY[^;]*TO authenticated[^;]*;/g) ?? [];
    expect(authenticatedPolicies.length).toBe(3);
    for (const p of authenticatedPolicies) {
      expect(p).toContain("FOR SELECT");
      expect(p).toContain("auth.uid()");
    }
  });

  it("stores no prohibited internal economics and touches no other table", () => {
    for (const bad of ["cost", "commission", "margin", "payout", "routing", "supplier", "wholesale", "secret", "token"]) expect(sql.toLowerCase()).not.toMatch(new RegExp(`\\b${bad}\\w*\\s+(numeric|text|integer|bigint)`));
    const altered = new Set(sql.match(/ALTER TABLE public\.(\w+)/g)?.map((m) => m.split("public.")[1]) ?? []);
    expect([...altered].sort()).toEqual(["commerce_listing_inquiries", "commerce_quote_lines", "commerce_quotes"]);
    expect(sql).toContain("checkout_url ~ '^https://'");
    expect(sql).toContain("quantity BETWEEN 1 AND 999");
  });
});
