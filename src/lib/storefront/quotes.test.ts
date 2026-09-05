import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Quote domain tests over a compact in-memory Supabase stub. Focus: the
 * commercial + security guarantees — tenant isolation, tier assignment on
 * send, snapshot immutability, one-time override never touching tier tables,
 * and prospect tier-on-enrollment.
 */
interface Row {
  [k: string]: unknown;
}
const store: Record<string, Row[]> = {};
const writes: Array<{ table: string; op: string; payload?: unknown }> = [];

function reset() {
  for (const k of Object.keys(store)) delete store[k];
  writes.length = 0;
  store.storefront_tenants = [{ id: "T1", price_tier_names: { "1": "Standard", "2": "Preferred", "3": "Premier" }, base_pricing_tier_id: "BASE" }];
  store.profiles = [
    { id: "CUST_A", storefront_tenant_id: "T1" }, // enrolled with T1
    { id: "CUST_B", storefront_tenant_id: "T2" }, // enrolled with a DIFFERENT tenant
  ];
  store.coffee_products = [
    { id: "P1", name: "Lavazza Classico", sku: "SKU-1", price: 45 },
  ];
  store.storefront_tenant_tier_prices = [
    { tenant_id: "T1", tier: 1, product_id: "P1", customer_price: 45 },
    { tenant_id: "T1", tier: 2, product_id: "P1", customer_price: 42 },
  ];
  store.coffee_product_tier_prices = [{ pricing_tier_id: "BASE", product_id: "P1", price: 28 }];
  store.storefront_quotes = [];
  store.storefront_quote_lines = [];
  store.storefront_customer_tiers = [];
}

function matches(row: Row, filters: Array<[string, unknown]>): boolean {
  return filters.every(([k, v]) => row[k] === v);
}

function makeChain(table: string) {
  const filters: Array<[string, unknown]> = [];
  let pending: Row[] | null = null;
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.order = () => chain;
  chain.eq = (k: string, v: unknown) => {
    filters.push([k, v]);
    return chain;
  };
  chain.in = (k: string, vals: unknown[]) => {
    filters.push(["__in_" + k, vals] as unknown as [string, unknown]);
    return chain;
  };
  const rowsNow = () =>
    (store[table] ?? []).filter((r) =>
      filters.every(([k, v]) =>
        String(k).startsWith("__in_")
          ? (v as unknown[]).includes(r[String(k).slice(5)])
          : r[k] === v,
      ),
    );
  chain.maybeSingle = async () => ({ data: rowsNow()[0] ?? null, error: null });
  chain.single = async () => ({ data: (pending ?? rowsNow())[0] ?? null, error: null });
  chain.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
    resolve({ data: rowsNow(), error: null });
  chain.insert = (payload: Row | Row[]) => {
    const arr = Array.isArray(payload) ? payload : [payload];
    const inserted = arr.map((r) => ({ id: r.id ?? `${table}_${(store[table] ?? []).length + Math.random()}`, ...r }));
    store[table] = [...(store[table] ?? []), ...inserted];
    writes.push({ table, op: "insert", payload: inserted });
    pending = inserted;
    return chain;
  };
  chain.update = (payload: Row) => {
    writes.push({ table, op: "update", payload });
    // Apply after filters are collected: defer via microtask-free approach —
    // return a chain whose terminal eq application mutates.
    const applier = {
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return applier;
      },
      then: (resolve: (x: { error: null }) => unknown) => {
        for (const r of store[table] ?? []) if (matches(r, filters)) Object.assign(r, payload);
        return resolve({ error: null });
      },
    };
    return applier;
  };
  chain.delete = () => {
    const applier = {
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return applier;
      },
      then: (resolve: (x: { error: null }) => unknown) => {
        store[table] = (store[table] ?? []).filter((r) => !matches(r, filters));
        writes.push({ table, op: "delete" });
        return resolve({ error: null });
      },
    };
    return applier;
  };
  chain.upsert = (payload: Row, _opts?: unknown) => {
    writes.push({ table, op: "upsert", payload });
    const key = ["tenant_id", "customer_profile_id"];
    const existing = (store[table] ?? []).find((r) => key.every((k) => r[k] === payload[k]));
    if (existing) Object.assign(existing, payload);
    else store[table] = [...(store[table] ?? []), payload];
    return { then: (resolve: (x: { error: null }) => unknown) => resolve({ error: null }) };
  };
  return chain;
}

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (t: string) => makeChain(t) },
}));

import {
  createQuote,
  updateDraftQuote,
  sendQuote,
  getQuote,
  assignTierFromQuoteOnEnroll,
  QuoteError,
} from "@/lib/storefront/quotes";

beforeEach(reset);

function tierRow(profile: string) {
  return store.storefront_customer_tiers.find((r) => r.customer_profile_id === profile);
}

describe("tenant isolation", () => {
  it("rejects quoting a customer enrolled with a different tenant", async () => {
    await expect(
      createQuote({ tenantId: "T1", createdBy: "OP", customerProfileId: "CUST_B", selectedTier: 2, lines: [{ product_id: "P1", quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("getQuote for the wrong tenant returns NOT_FOUND", async () => {
    const { quote } = await createQuote({ tenantId: "T1", createdBy: "OP", customerProfileId: "CUST_A", selectedTier: 1, lines: [{ product_id: "P1", quantity: 1 }] });
    await expect(getQuote("T2", (quote as { id: string }).id)).rejects.toBeInstanceOf(QuoteError);
  });
});

describe("draft vs send tier assignment", () => {
  it("creating/editing a DRAFT does not change the customer's tier", async () => {
    const { quote } = await createQuote({ tenantId: "T1", createdBy: "OP", customerProfileId: "CUST_A", selectedTier: 1, lines: [{ product_id: "P1", quantity: 1 }] });
    await updateDraftQuote("T1", (quote as { id: string }).id, { selectedTier: 2 });
    expect(tierRow("CUST_A")).toBeUndefined(); // no assignment yet
  });

  it("sending an existing-customer quote assigns the selected tier", async () => {
    const { quote } = await createQuote({ tenantId: "T1", createdBy: "OP", customerProfileId: "CUST_A", selectedTier: 2, lines: [{ product_id: "P1", quantity: 4 }] });
    const sent = await sendQuote("T1", (quote as { id: string }).id);
    expect((sent.quote as { status: string }).status).toBe("sent");
    expect(sent.rawToken).toMatch(/^[a-f0-9]{48}$/);
    expect(tierRow("CUST_A")).toMatchObject({ tier: 2 });
  });
});

describe("pricing behaviour", () => {
  it("tier change recalculates the quote (Tier1 45 -> Tier2 42)", async () => {
    const { quote } = await createQuote({ tenantId: "T1", createdBy: "OP", customerProfileId: "CUST_A", selectedTier: 1, lines: [{ product_id: "P1", quantity: 1 }] });
    expect((quote as { total: number }).total).toBe(45);
    const updated = await updateDraftQuote("T1", (quote as { id: string }).id, { selectedTier: 2 });
    expect((updated.quote as { total: number }).total).toBe(42);
  });

  it("a one-time override changes the quote but never writes tier tables", async () => {
    await createQuote({
      tenantId: "T1", createdBy: "OP", customerProfileId: "CUST_A", selectedTier: 2,
      lines: [{ product_id: "P1", quantity: 1, override_unit_price: 40 }],
    });
    const line = store.storefront_quote_lines[0];
    expect(line.is_override).toBe(true);
    expect(line.quoted_unit_price).toBe(40);
    expect(line.tier_unit_price).toBe(42);
    // The tier price table was never written by the quote flow.
    expect(writes.some((w) => w.table === "storefront_tenant_tier_prices")).toBe(false);
  });

  it("snapshot is immutable: editing the tier table after send does not change sent lines", async () => {
    const { quote } = await createQuote({ tenantId: "T1", createdBy: "OP", customerProfileId: "CUST_A", selectedTier: 2, lines: [{ product_id: "P1", quantity: 1 }] });
    await sendQuote("T1", (quote as { id: string }).id);
    const snapshot = store.storefront_quote_lines[0].quoted_unit_price;
    // Operator later changes Tier 2 pricing.
    store.storefront_tenant_tier_prices.find((r) => r.tier === 2)!.customer_price = 99;
    const reread = await getQuote("T1", (quote as { id: string }).id);
    expect((reread.lines[0] as { quoted_unit_price: number }).quoted_unit_price).toBe(snapshot);
    expect(snapshot).toBe(42);
  });
});

describe("prospect enrollment", () => {
  it("assigns the quoted tier once the prospect is enrolled", async () => {
    const { quote } = await createQuote({
      tenantId: "T1", createdBy: "OP", prospect: { email: "acme@example.com" }, selectedTier: 3,
      lines: [{ product_id: "P1", quantity: 1 }],
    });
    const sent = await sendQuote("T1", (quote as { id: string }).id);
    // Prospect not yet enrolled -> no tier row.
    expect(store.storefront_customer_tiers.length).toBe(0);
    // Prospect enrolls: a profile now belongs to T1.
    store.profiles.push({ id: "NEWCUST", storefront_tenant_id: "T1" });
    await assignTierFromQuoteOnEnroll(sent.rawToken, "NEWCUST");
    expect(tierRow("NEWCUST")).toMatchObject({ tier: 3 });
  });
});
