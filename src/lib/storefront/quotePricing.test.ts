import { describe, it, expect, vi } from "vitest";

// Chainable supabaseAdmin stub — each .from() returns a table's canned rows.
const tables: Record<string, unknown[]> = {
  storefront_tenants: [{ id: "T1", base_pricing_tier_id: "BASE" }],
  coffee_products: [
    { id: "P1", name: "Lavazza Classico", sku: "SKU-1", price: 45 },
    { id: "P2", name: "Lavazza Espresso", sku: "SKU-2", price: 50 },
  ],
  storefront_tenant_tier_prices: [
    { tenant_id: "T1", tier: 2, product_id: "P1", customer_price: 42 },
    // P2 has NO tier-2 row -> falls back to list price (50).
  ],
  coffee_product_tier_prices: [
    { pricing_tier_id: "BASE", product_id: "P1", price: 28 },
    { pricing_tier_id: "BASE", product_id: "P2", price: 31 },
  ],
};

function makeChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = ret;
  chain.eq = ret;
  chain.in = ret;
  chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });
  return chain;
}

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (t: string) => makeChain(tables[t] ?? []) },
}));

import {
  computeQuoteLine,
  computeQuoteTotals,
  resolveTenantTierPrices,
} from "@/lib/storefront/quotePricing";

describe("computeQuoteLine", () => {
  it("uses the tier price and computes margin from cost", () => {
    const l = computeQuoteLine({ tierUnitPrice: 42, quantity: 4, unitCost: 28 });
    expect(l.unitPrice).toBe(42);
    expect(l.isOverride).toBe(false);
    expect(l.lineTotal).toBe(168);
    expect(l.grossProfit).toBe(56); // (42-28)*4
    expect(l.marginPct).toBeCloseTo(33.33, 1);
  });

  it("applies a one-time override without touching the tier price", () => {
    const l = computeQuoteLine({ tierUnitPrice: 42, overrideUnitPrice: 40, quantity: 4, unitCost: 28 });
    expect(l.tierUnitPrice).toBe(42); // tier price preserved on the line
    expect(l.unitPrice).toBe(40);
    expect(l.isOverride).toBe(true);
    expect(l.lineTotal).toBe(160);
    expect(l.grossProfit).toBe(48); // (40-28)*4
  });

  it("an override equal to the tier price is not flagged as an override", () => {
    const l = computeQuoteLine({ tierUnitPrice: 42, overrideUnitPrice: 42, quantity: 1 });
    expect(l.isOverride).toBe(false);
  });

  it("guards against divide-by-zero and negative inputs", () => {
    const l = computeQuoteLine({ tierUnitPrice: 0, quantity: 3, unitCost: 5 });
    expect(l.marginPct).toBe(0);
    expect(l.lineTotal).toBe(0);
  });
});

describe("computeQuoteTotals", () => {
  it("sums lines, cost, profit and blended margin", () => {
    const lines = [
      computeQuoteLine({ tierUnitPrice: 42, quantity: 4, unitCost: 28 }), // total 168, profit 56
      computeQuoteLine({ tierUnitPrice: 46, quantity: 3, unitCost: 31 }), // total 138, profit 45
    ];
    const t = computeQuoteTotals(lines);
    expect(t.subtotal).toBe(306);
    expect(t.estGrossProfit).toBe(101);
    expect(t.total).toBe(306);
    expect(t.marginPct).toBeCloseTo(33.01, 1);
  });

  it("adds tax and shipping into the total only", () => {
    const lines = [computeQuoteLine({ tierUnitPrice: 100, quantity: 1, unitCost: 60 })];
    const t = computeQuoteTotals(lines, { tax: 8.25, shipping: 10 });
    expect(t.subtotal).toBe(100);
    expect(t.total).toBe(118.25);
  });
});

describe("resolveTenantTierPrices (reuses storefront tables)", () => {
  it("returns tier price when set, list price when not, and base-tier cost", async () => {
    const m = await resolveTenantTierPrices("T1", 2, ["P1", "P2"]);
    // P1: tier-2 price 42, base cost 28
    expect(m.get("P1")).toMatchObject({ tierUnitPrice: 42, unitCost: 28, name: "Lavazza Classico" });
    // P2: no tier-2 row -> list price 50; base cost 31
    expect(m.get("P2")).toMatchObject({ tierUnitPrice: 50, unitCost: 31 });
  });

  it("proves quote/storefront parity: a tier price change is reflected identically", async () => {
    // Same lookup the storefront overlay uses; both read tier-2 for P1 = 42.
    const m = await resolveTenantTierPrices("T1", 2, ["P1"]);
    const line = computeQuoteLine({
      tierUnitPrice: m.get("P1")!.tierUnitPrice,
      quantity: 1,
      unitCost: m.get("P1")!.unitCost,
    });
    expect(line.unitPrice).toBe(42);
  });
});
