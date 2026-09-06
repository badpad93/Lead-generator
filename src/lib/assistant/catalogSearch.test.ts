import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseStub, type StubStore } from "./__testutils__/supabaseStub";

const store: StubStore = {};
const stub = createSupabaseStub(store);
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));

const pricingCalls: unknown[] = [];
vi.mock("@/lib/coffeePricing", () => ({
  resolveCoffeeProductsPricing: async (args: { productIds: string[]; userId?: string | null; storefront?: { tenantId: string } | null }) => {
    pricingCalls.push(args);
    const out = new Map();
    for (const id of args.productIds) {
      const base = { product_id: id, pricing_tier_id: "T1", tier_key: "tier_1", tier_name: "Tier 1", currency: "USD", shipping_cost: 2.5 };
      if (args.storefront) out.set(id, { ...base, price: 39, fallback_used: false, fallback_reason: null, storefront: { base_price: 30, commission: 9, price_source: "tenant_price", base_pricing_tier_id: "BASE", error: null } });
      else if (args.userId) out.set(id, { ...base, price: 41, fallback_used: false, fallback_reason: null });
      else out.set(id, { ...base, price: 45, fallback_used: true, fallback_reason: "no-tier-assigned-defaulted-tier-1" });
    }
    return out;
  },
}));

import { resolveCoffeeProductsPricing } from "@/lib/coffeePricing";
import { findProhibitedKey } from "./publicShapes";
import { catalogDetails, searchCatalog, searchLocationServices, LOCATION_OFFERINGS } from "./catalogSearch";

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  pricingCalls.length = 0;
  store.coffee_products = [
    { id: "P1", name: "Lavazza Classico", sku: "SKU-1", description: "Medium roast", image_url: null, unit: "case", min_order_qty: 1, pack_quantity: 6, stock_status: "in_stock", active: true, category_id: "C1", sort_order: 1, coffee_categories: { name: "Coffee", slug: "coffee" }, price: 45, supplier_cost: 20 },
    { id: "P2", name: "Hidden Blend", sku: "SKU-2", description: "Hidden for tenant", image_url: null, unit: "case", min_order_qty: 1, pack_quantity: 6, stock_status: "in_stock", active: true, category_id: "C1", sort_order: 2, coffee_categories: { name: "Coffee", slug: "coffee" }, price: 50 },
    { id: "P3", name: "Inactive", sku: "SKU-3", description: "", image_url: null, unit: "case", min_order_qty: 1, pack_quantity: 6, stock_status: "in_stock", active: false, category_id: "C1", sort_order: 3, coffee_categories: null, price: 1 },
  ];
  store.storefront_tenant_hidden_products = [{ tenant_id: "TEN", product_id: "P2" }];
  store.machine_listings = [
    { id: "M1", status: "active", title: "AI Cooler", description: "Smart cooler", machine_make: "Vendera", machine_model: "X1", machine_type: "AI", condition: "new", quantity: 3, city: "Denver", state: "CO", asking_price: 4999, buy_now_enabled: true, buy_now_price: 479900, delivery_fee_cents: 25000, photos: [], created_at: "2026-01-01", wholesale_price_cents: 300000, admin_notes: "secret", contact_email: "seller@example.com", created_by: "U9" },
    { id: "M2", status: "pending", title: "Not live", machine_type: "Combo", created_at: "2026-01-02" },
  ];
});

describe("catalog service — coffee", () => {
  it("returns the same final price the pricing resolver returns for the same viewer", async () => {
    const guest = await searchCatalog("coffee", { query: null, categorySlug: null, limit: 10 }, { userId: null, storefront: null });
    const resolved = await resolveCoffeeProductsPricing({ productIds: ["P1"], userId: null });
    expect(guest.find((i) => i.product_id === "P1")?.display_price).toBe(resolved.get("P1")?.price);
    expect(guest.find((i) => i.product_id === "P1")?.price_basis).toBe("list");

    const user = await searchCatalog("coffee", { query: null, categorySlug: null, limit: 10 }, { userId: "U1", storefront: null });
    expect(user.find((i) => i.product_id === "P1")?.display_price).toBe(41);
    expect(user.find((i) => i.product_id === "P1")?.price_basis).toBe("tier");
  });

  it("applies the storefront context and hides tenant-hidden products", async () => {
    const items = await searchCatalog("coffee", { query: null, categorySlug: null, limit: 10 }, { userId: "CUST", storefront: { tenantId: "TEN", customerProfileId: "CUST" } });
    expect(items.map((i) => i.product_id)).toEqual(["P1"]);
    expect(items[0].display_price).toBe(39);
    expect(items[0].price_basis).toBe("storefront");
    expect((pricingCalls[0] as { storefront: { tenantId: string } }).storefront.tenantId).toBe("TEN");
    const details = await catalogDetails("coffee", ["P2"], { userId: "CUST", storefront: { tenantId: "TEN", customerProfileId: "CUST" } });
    expect(details).toEqual([]);
  });

  it("excludes inactive products and never exposes internal columns", async () => {
    const items = await searchCatalog("coffee", { query: null, categorySlug: null, limit: 10 }, { userId: null, storefront: null });
    expect(items.map((i) => i.product_id)).not.toContain("P3");
    for (const i of items) {
      expect(findProhibitedKey(i)).toBeNull();
      expect(JSON.stringify(i)).not.toContain("supplier_cost");
    }
    const detail = await catalogDetails("coffee", ["P1"], { userId: null, storefront: null });
    expect(findProhibitedKey(detail)).toBeNull();
    expect(detail[0].shipping_note).toContain("2.50");
  });
});

describe("catalog service — machines", () => {
  it("passes rows through the public machine shape and drops private fields", async () => {
    const items = await searchCatalog("machine", { query: null, categorySlug: null, limit: 10 }, { userId: null, storefront: null });
    expect(items.map((i) => i.product_id)).toEqual(["M1"]);
    const json = JSON.stringify(items);
    for (const bad of ["wholesale", "admin_notes", "contact_email", "created_by", "300000", "secret", "seller@example.com"]) expect(json).not.toContain(bad);
    expect(items[0].display_price).toBe(4799);
    expect(items[0].price_basis).toBe("buy_now");
    expect(items[0].href).toBe("/machines-for-sale/M1");
    const detail = await catalogDetails("machine", ["M1"], { userId: null, storefront: null });
    expect(findProhibitedKey(detail)).toBeNull();
    expect(detail[0].attributes.find((a) => a.label === "Delivery fee")?.value).toBe("$250.00");
  });
});

describe("catalog service — location services stay informational", () => {
  it("describes the tier ladder with pricing_mode=requires_qualification and no customer quote", () => {
    const items = searchLocationServices({ query: null, categorySlug: null, limit: 10 });
    expect(items).toHaveLength(LOCATION_OFFERINGS.length);
    for (const i of items) {
      expect(i.pricing_mode).toBe("requires_qualification");
      expect(i.price_basis).toBe("tier_ladder");
      expect(i.availability).toBe("informational");
      expect(findProhibitedKey(i)).toBeNull();
    }
    expect(items.map((i) => i.display_price)).toEqual([500, 800, 1200, 400]);
  });
});
