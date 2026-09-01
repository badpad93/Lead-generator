import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * These tests exercise the storefront pricing resolver in isolation.
 * The Supabase client is mocked so we can assert precedence + floor
 * behavior without a live DB. The mock accepts .from(table).select
 * (...).chain(...)... and returns whatever the test scenario has
 * queued for that table.
 *
 * Test surface covers every rule from the spec:
 *   - Precedence order (proposal > customer > tenant > product recommended > base tier)
 *   - Floor enforcement (customer price < base -> hard error)
 *   - No-base-price is a hard error (never silently zero-cost commission)
 *   - Tenant status gate (only "approved" tenants can check out)
 *   - Rounding to 2dp
 *   - Multi-line + mixed sources on one cart
 *   - Empty cart / bad quantity rejection
 *   - Accepted-proposal check: pending proposal is IGNORED, only accepted counts
 *   - Tax always 0 (all resale)
 */

interface Scenario {
  tenants: Array<{ id: string; status: string; base_pricing_tier_id: string | null }>;
  products: Array<{ id: string; name: string; sku: string; price: number | null; active: boolean }>;
  tierPrices: Array<{ pricing_tier_id: string; product_id: string; price: number }>;
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
      filtered.rows.length > 0 ? { data: filtered.rows[0], error: null } : { data: null, error: null },
    then: async (
      onFulfilled: (v: { data: T[]; error: null }) => unknown,
    ) => onFulfilled({ data: filtered.rows, error: null }),
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

import {
  resolveCart,
  round2,
  PricingResolutionError,
} from "./pricing";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const TIER_ID = "00000000-0000-0000-0000-000000000002";
const CUSTOMER_ID = "00000000-0000-0000-0000-000000000003";
const PRODUCT_A = "00000000-0000-0000-0000-0000000000aa";
const PRODUCT_B = "00000000-0000-0000-0000-0000000000bb";
const PROPOSAL_ID = "00000000-0000-0000-0000-0000000000dd";

function baseScenario(): Scenario {
  return {
    tenants: [{ id: TENANT_ID, status: "approved", base_pricing_tier_id: TIER_ID }],
    products: [
      { id: PRODUCT_A, name: "House Blend 5lb", sku: "HB-5", price: 45.0, active: true },
      { id: PRODUCT_B, name: "Cups 1000ct", sku: "CUP-1K", price: 55.0, active: true },
    ],
    tierPrices: [
      { pricing_tier_id: TIER_ID, product_id: PRODUCT_A, price: 40.0 },
      { pricing_tier_id: TIER_ID, product_id: PRODUCT_B, price: 50.0 },
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

describe("round2", () => {
  it("rounds 0.1 + 0.2 cleanly", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
  it("rounds half up", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
  });
  it("returns 0 for non-finite", () => {
    expect(round2(Number.NaN)).toBe(0);
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("resolveCart — precedence", () => {
  it("falls back to base tier when nothing else is configured", async () => {
    // Clear the product's recommended price so we can prove the
    // very-last-resort base_tier fallback fires. With
    // product.price null, no proposal, no tenant/customer override,
    // no product_recommended -> base_tier is the only remaining
    // source.
    scenario.products[0].price = null;
    const cart = await resolveCart({
      tenantId: TENANT_ID,
      customerProfileId: CUSTOMER_ID,
      lines: [{ product_id: PRODUCT_A, quantity: 2 }],
    });
    const line = cart.lines[0];
    expect(line.price_source).toBe("base_tier");
    // Tier price ($40) is BOTH base and tenant when nothing else
    // beats it — commission is $0 in that case.
    expect(line.base_price_per_unit).toBe(40);
    expect(line.tenant_price_per_unit).toBe(40);
    expect(line.commission_per_unit).toBe(0);
    expect(line.base_price_amount).toBe(80);
    expect(line.tenant_price_amount).toBe(80);
    expect(line.commission_amount).toBe(0);
  });

  it("uses product recommended price above base when set", async () => {
    // Base tier still $40, product recommended $45. No tenant or
    // customer override yet -> product_recommended wins.
    const cart = await resolveCart({
      tenantId: TENANT_ID,
      customerProfileId: CUSTOMER_ID,
      lines: [{ product_id: PRODUCT_A, quantity: 1 }],
    });
    const line = cart.lines[0];
    expect(line.price_source).toBe("product_recommended");
    expect(line.base_price_per_unit).toBe(40);
    expect(line.tenant_price_per_unit).toBe(45);
    expect(line.commission_per_unit).toBe(5);
  });

  it("tenant_price beats product recommended", async () => {
    scenario.tenantPrices.push({
      tenant_id: TENANT_ID,
      product_id: PRODUCT_A,
      customer_price: 50,
      active: true,
    });
    const cart = await resolveCart({
      tenantId: TENANT_ID,
      customerProfileId: CUSTOMER_ID,
      lines: [{ product_id: PRODUCT_A, quantity: 1 }],
    });
    expect(cart.lines[0].price_source).toBe("tenant_price");
    expect(cart.lines[0].tenant_price_per_unit).toBe(50);
    expect(cart.lines[0].commission_per_unit).toBe(10);
  });

  it("customer override beats tenant price", async () => {
    scenario.tenantPrices.push({
      tenant_id: TENANT_ID,
      product_id: PRODUCT_A,
      customer_price: 50,
      active: true,
    });
    scenario.customerPrices.push({
      customer_profile_id: CUSTOMER_ID,
      product_id: PRODUCT_A,
      customer_price: 55,
      active: true,
    });
    const cart = await resolveCart({
      tenantId: TENANT_ID,
      customerProfileId: CUSTOMER_ID,
      lines: [{ product_id: PRODUCT_A, quantity: 1 }],
    });
    expect(cart.lines[0].price_source).toBe("customer_override");
    expect(cart.lines[0].tenant_price_per_unit).toBe(55);
    expect(cart.lines[0].commission_per_unit).toBe(15);
  });

  it("accepted proposal beats everything else", async () => {
    scenario.tenantPrices.push({
      tenant_id: TENANT_ID,
      product_id: PRODUCT_A,
      customer_price: 50,
      active: true,
    });
    scenario.customerPrices.push({
      customer_profile_id: CUSTOMER_ID,
      product_id: PRODUCT_A,
      customer_price: 55,
      active: true,
    });
    scenario.proposals.push({ id: PROPOSAL_ID, status: "accepted" });
    scenario.proposalItems.push({
      proposal_id: PROPOSAL_ID,
      product_id: PRODUCT_A,
      unit_price: 48,
    });
    const cart = await resolveCart({
      tenantId: TENANT_ID,
      customerProfileId: CUSTOMER_ID,
      lines: [{ product_id: PRODUCT_A, quantity: 1 }],
      acceptedProposalId: PROPOSAL_ID,
    });
    expect(cart.lines[0].price_source).toBe("accepted_proposal");
    expect(cart.lines[0].tenant_price_per_unit).toBe(48);
    expect(cart.lines[0].commission_per_unit).toBe(8);
  });

  it("ignores a non-accepted proposal — pending must not affect pricing", async () => {
    scenario.proposals.push({ id: PROPOSAL_ID, status: "sent" });
    scenario.proposalItems.push({
      proposal_id: PROPOSAL_ID,
      product_id: PRODUCT_A,
      unit_price: 41,
    });
    const cart = await resolveCart({
      tenantId: TENANT_ID,
      customerProfileId: CUSTOMER_ID,
      lines: [{ product_id: PRODUCT_A, quantity: 1 }],
      acceptedProposalId: PROPOSAL_ID,
    });
    // Falls through to product_recommended ($45).
    expect(cart.lines[0].price_source).toBe("product_recommended");
    expect(cart.lines[0].tenant_price_per_unit).toBe(45);
  });
});

describe("resolveCart — floor enforcement", () => {
  it("throws when tenant price is below base tier", async () => {
    scenario.tenantPrices.push({
      tenant_id: TENANT_ID,
      product_id: PRODUCT_A,
      customer_price: 35, // below the $40 tier
      active: true,
    });
    await expect(
      resolveCart({
        tenantId: TENANT_ID,
        customerProfileId: CUSTOMER_ID,
        lines: [{ product_id: PRODUCT_A, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(PricingResolutionError);
  });

  it("throws when customer override is below base tier", async () => {
    scenario.customerPrices.push({
      customer_profile_id: CUSTOMER_ID,
      product_id: PRODUCT_A,
      customer_price: 30,
      active: true,
    });
    await expect(
      resolveCart({
        tenantId: TENANT_ID,
        customerProfileId: CUSTOMER_ID,
        lines: [{ product_id: PRODUCT_A, quantity: 1 }],
      }),
    ).rejects.toThrow(/below base/);
  });

  it("throws when accepted proposal line is below base tier", async () => {
    scenario.proposals.push({ id: PROPOSAL_ID, status: "accepted" });
    scenario.proposalItems.push({
      proposal_id: PROPOSAL_ID,
      product_id: PRODUCT_A,
      unit_price: 20,
    });
    await expect(
      resolveCart({
        tenantId: TENANT_ID,
        customerProfileId: CUSTOMER_ID,
        lines: [{ product_id: PRODUCT_A, quantity: 1 }],
        acceptedProposalId: PROPOSAL_ID,
      }),
    ).rejects.toThrow(/below base/);
  });
});

describe("resolveCart — hard errors", () => {
  it("throws EMPTY_CART on empty lines", async () => {
    await expect(
      resolveCart({ tenantId: TENANT_ID, customerProfileId: CUSTOMER_ID, lines: [] }),
    ).rejects.toMatchObject({ code: "EMPTY_CART" });
  });

  it("throws BAD_QUANTITY on non-positive quantity", async () => {
    await expect(
      resolveCart({
        tenantId: TENANT_ID,
        customerProfileId: CUSTOMER_ID,
        lines: [{ product_id: PRODUCT_A, quantity: 0 }],
      }),
    ).rejects.toMatchObject({ code: "BAD_QUANTITY" });
  });

  it("throws TENANT_NOT_APPROVED for a suspended tenant", async () => {
    scenario.tenants[0].status = "suspended";
    await expect(
      resolveCart({
        tenantId: TENANT_ID,
        customerProfileId: CUSTOMER_ID,
        lines: [{ product_id: PRODUCT_A, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "TENANT_NOT_APPROVED" });
  });

  it("throws NO_BASE_PRICE when the product has no tier AND no recommended", async () => {
    scenario.tierPrices = [];
    scenario.products[0].price = null;
    await expect(
      resolveCart({
        tenantId: TENANT_ID,
        customerProfileId: CUSTOMER_ID,
        lines: [{ product_id: PRODUCT_A, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "NO_BASE_PRICE" });
  });

  it("throws PRODUCT_INACTIVE for a deactivated product", async () => {
    scenario.products[0].active = false;
    await expect(
      resolveCart({
        tenantId: TENANT_ID,
        customerProfileId: CUSTOMER_ID,
        lines: [{ product_id: PRODUCT_A, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_INACTIVE" });
  });
});

describe("resolveCart — money math", () => {
  it("computes multi-line cart totals and never carries a floating remainder", async () => {
    // Mix a tier row and a tenant-override row on the same cart.
    scenario.tenantPrices.push({
      tenant_id: TENANT_ID,
      product_id: PRODUCT_B,
      customer_price: 62.5,
      active: true,
    });
    const cart = await resolveCart({
      tenantId: TENANT_ID,
      customerProfileId: CUSTOMER_ID,
      lines: [
        { product_id: PRODUCT_A, quantity: 3 },
        { product_id: PRODUCT_B, quantity: 2 },
      ],
    });
    // Product A: base 40, product recommended 45. Qty 3 -> 135 tenant / 120 base / 15 commission.
    // Product B: base 50, tenant override 62.5. Qty 2 -> 125 tenant / 100 base / 25 commission.
    // Totals: base 220, tenant 260, commission 40, tax 0, order 260.
    expect(cart.totals.base_price_total).toBe(220);
    expect(cart.totals.tenant_price_total).toBe(260);
    expect(cart.totals.commission_total).toBe(40);
    expect(cart.totals.tax_total).toBe(0);
    expect(cart.totals.order_total).toBe(260);
  });

  it("tax is always 0 (all storefront transactions are resale)", async () => {
    scenario.tenantPrices.push({
      tenant_id: TENANT_ID,
      product_id: PRODUCT_A,
      customer_price: 49.99,
      active: true,
    });
    const cart = await resolveCart({
      tenantId: TENANT_ID,
      customerProfileId: CUSTOMER_ID,
      lines: [{ product_id: PRODUCT_A, quantity: 7 }],
    });
    expect(cart.lines[0].tax_amount).toBe(0);
    expect(cart.totals.tax_total).toBe(0);
    // Also confirm the tenant total = the order total when tax = 0.
    expect(cart.totals.order_total).toBe(cart.totals.tenant_price_total);
  });
});
