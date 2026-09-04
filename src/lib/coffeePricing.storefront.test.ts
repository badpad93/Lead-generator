import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Storefront overlay tests for the unified coffee pricing resolver —
 * ported from the retired src/lib/storefront/pricing.test.ts when the
 * standalone storefront resolver was collapsed into
 * resolveCoffeeProductsPricing. Same mock harness: supabaseAdmin is
 * replaced with an in-memory chain over per-table scenario rows.
 *
 * Rules under test (the money rules):
 *   - Sell-price precedence: accepted proposal > customer override >
 *     tenant price > product list price > tenant base-tier price
 *   - Commission base: tenant tier price, else product list price
 *   - Floor: sell below base → PRICE_BELOW_BASE error flag
 *   - No base at all → NO_BASE_PRICE error flag
 *   - Pending proposals NEVER price anything
 *   - Storefront lines ship free (shipping_cost forced to 0)
 *   - 2dp rounding everywhere
 */

interface Scenario {
  tenants: Array<{ id: string; status: string; base_pricing_tier_id: string | null }>;
  products: Array<{ id: string; price: number | null; shipping_cost?: number | null }>;
  tierPrices: Array<{
    pricing_tier_id: string;
    product_id: string;
    price: number;
    is_active: boolean;
  }>;
  tenantPrices: Array<{ tenant_id: string; product_id: string; customer_price: number; active: boolean }>;
  customerPrices: Array<{
    customer_profile_id: string;
    product_id: string;
    customer_price: number;
    active: boolean;
  }>;
  proposals: Array<{ id: string; status: string }>;
  proposalItems: Array<{ proposal_id: string; product_id: string; unit_price: number }>;
}

let scenario: Scenario;

function chain<T>(rows: T[]) {
  const filtered = { rows: [...rows] };
  const api = {
    select: () => api,
    eq: (col: string, val: unknown) => {
      filtered.rows = filtered.rows.filter((r) => (r as Record<string, unknown>)[col] === val);
      return api;
    },
    in: (col: string, vals: unknown[]) => {
      filtered.rows = filtered.rows.filter((r) =>
        vals.includes((r as Record<string, unknown>)[col]),
      );
      return api;
    },
    maybeSingle: async () =>
      filtered.rows.length > 0
        ? { data: filtered.rows[0], error: null }
        : { data: null, error: null },
    then: async (onFulfilled: (v: { data: T[]; error: null }) => unknown) =>
      onFulfilled({ data: filtered.rows, error: null }),
  };
  return api;
}

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from(table: string) {
      switch (table) {
        case "storefront_tenants":
          return chain(scenario.tenants);
        case "coffee_products":
          return chain(scenario.products);
        case "coffee_product_tier_prices":
          return chain(scenario.tierPrices);
        case "storefront_tenant_prices":
          return chain(scenario.tenantPrices);
        case "storefront_customer_prices":
          return chain(scenario.customerPrices);
        case "coffee_pricing_proposals":
          return chain(scenario.proposals);
        case "coffee_pricing_proposal_items":
          return chain(scenario.proposalItems);
        default:
          return chain([]);
      }
    },
  },
}));

import { resolveCoffeeProductsPricing, round2 } from "./coffeePricing";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const TIER_ID = "00000000-0000-0000-0000-000000000002";
const CUSTOMER_ID = "00000000-0000-0000-0000-000000000003";
const PRODUCT_A = "00000000-0000-0000-0000-0000000000aa";
const PROPOSAL_ID = "00000000-0000-0000-0000-0000000000dd";

function baseScenario(): Scenario {
  return {
    tenants: [{ id: TENANT_ID, status: "approved", base_pricing_tier_id: TIER_ID }],
    products: [{ id: PRODUCT_A, price: 45.0 }],
    tierPrices: [
      { pricing_tier_id: TIER_ID, product_id: PRODUCT_A, price: 40.0, is_active: true },
    ],
    tenantPrices: [],
    customerPrices: [],
    proposals: [],
    proposalItems: [],
  };
}

beforeEach(() => {
  scenario = baseScenario();
});

async function resolveA(acceptedProposalId?: string | null) {
  const map = await resolveCoffeeProductsPricing({
    productIds: [PRODUCT_A],
    userId: CUSTOMER_ID,
    storefront: {
      tenantId: TENANT_ID,
      customerProfileId: CUSTOMER_ID,
      acceptedProposalId: acceptedProposalId ?? null,
    },
  });
  const entry = map.get(PRODUCT_A);
  if (!entry?.storefront) throw new Error("storefront overlay missing from entry");
  return entry;
}

describe("round2", () => {
  it("rounds 0.1 + 0.2 cleanly and half up", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
  it("returns 0 for non-finite", () => {
    expect(round2(Number.NaN)).toBe(0);
  });
});

describe("storefront overlay — precedence", () => {
  it("uses product list price over base tier when nothing else is configured", async () => {
    const e = await resolveA();
    expect(e.price).toBe(45.0);
    expect(e.storefront!.price_source).toBe("product_recommended");
    expect(e.storefront!.base_price).toBe(40.0);
    expect(e.storefront!.commission).toBe(5.0);
    expect(e.storefront!.error).toBeNull();
  });

  it("falls all the way back to base tier when the product has no list price", async () => {
    scenario.products[0].price = null;
    const e = await resolveA();
    expect(e.price).toBe(40.0);
    expect(e.storefront!.price_source).toBe("base_tier");
    expect(e.storefront!.commission).toBe(0);
    expect(e.storefront!.error).toBeNull();
  });

  it("tenant price beats product list price", async () => {
    scenario.tenantPrices.push({
      tenant_id: TENANT_ID,
      product_id: PRODUCT_A,
      customer_price: 48.0,
      active: true,
    });
    const e = await resolveA();
    expect(e.price).toBe(48.0);
    expect(e.storefront!.price_source).toBe("tenant_price");
    expect(e.storefront!.commission).toBe(8.0);
  });

  it("customer override beats tenant price", async () => {
    scenario.tenantPrices.push({
      tenant_id: TENANT_ID,
      product_id: PRODUCT_A,
      customer_price: 48.0,
      active: true,
    });
    scenario.customerPrices.push({
      customer_profile_id: CUSTOMER_ID,
      product_id: PRODUCT_A,
      customer_price: 47.0,
      active: true,
    });
    const e = await resolveA();
    expect(e.price).toBe(47.0);
    expect(e.storefront!.price_source).toBe("customer_override");
  });

  it("accepted proposal beats everything", async () => {
    scenario.customerPrices.push({
      customer_profile_id: CUSTOMER_ID,
      product_id: PRODUCT_A,
      customer_price: 47.0,
      active: true,
    });
    scenario.proposals.push({ id: PROPOSAL_ID, status: "accepted" });
    scenario.proposalItems.push({
      proposal_id: PROPOSAL_ID,
      product_id: PRODUCT_A,
      unit_price: 46.0,
    });
    const e = await resolveA(PROPOSAL_ID);
    expect(e.price).toBe(46.0);
    expect(e.storefront!.price_source).toBe("accepted_proposal");
  });

  it("a PENDING proposal never prices anything", async () => {
    scenario.customerPrices.push({
      customer_profile_id: CUSTOMER_ID,
      product_id: PRODUCT_A,
      customer_price: 47.0,
      active: true,
    });
    scenario.proposals.push({ id: PROPOSAL_ID, status: "pending" });
    scenario.proposalItems.push({
      proposal_id: PROPOSAL_ID,
      product_id: PRODUCT_A,
      unit_price: 1.0,
    });
    const e = await resolveA(PROPOSAL_ID);
    expect(e.price).toBe(47.0);
    expect(e.storefront!.price_source).toBe("customer_override");
  });

  it("inactive tenant/customer prices are ignored", async () => {
    scenario.tenantPrices.push({
      tenant_id: TENANT_ID,
      product_id: PRODUCT_A,
      customer_price: 48.0,
      active: false,
    });
    const e = await resolveA();
    expect(e.storefront!.price_source).toBe("product_recommended");
  });
});

describe("storefront overlay — floor and error flags", () => {
  it("flags PRICE_BELOW_BASE when a configured price undercuts the base", async () => {
    scenario.customerPrices.push({
      customer_profile_id: CUSTOMER_ID,
      product_id: PRODUCT_A,
      customer_price: 39.0,
      active: true,
    });
    const e = await resolveA();
    expect(e.storefront!.error).toBe("PRICE_BELOW_BASE");
  });

  it("flags NO_BASE_PRICE when there is no tier assignment and no list price", async () => {
    scenario.tenants[0].base_pricing_tier_id = null;
    scenario.products[0].price = null;
    const e = await resolveA();
    expect(e.storefront!.error).toBe("NO_BASE_PRICE");
  });

  it("no tier assigned but list price present → sells at list with $0 commission, no error", async () => {
    scenario.tenants[0].base_pricing_tier_id = null;
    const e = await resolveA();
    expect(e.price).toBe(45.0);
    expect(e.storefront!.base_price).toBe(45.0);
    expect(e.storefront!.commission).toBe(0);
    expect(e.storefront!.error).toBeNull();
  });
});

describe("storefront overlay — invariants", () => {
  it("forces shipping to 0 and snapshots the tenant's tier id", async () => {
    const e = await resolveA();
    expect(e.shipping_cost).toBe(0);
    expect(e.pricing_tier_id).toBe(TIER_ID);
    expect(e.storefront!.base_pricing_tier_id).toBe(TIER_ID);
  });

  it("rounds sell, base, and commission to 2dp", async () => {
    scenario.tenantPrices.push({
      tenant_id: TENANT_ID,
      product_id: PRODUCT_A,
      customer_price: 48.555,
      active: true,
    });
    scenario.tierPrices[0].price = 40.004;
    const e = await resolveA();
    expect(e.price).toBe(48.56);
    expect(e.storefront!.base_price).toBe(40.0);
    expect(e.storefront!.commission).toBe(8.56);
  });
});
