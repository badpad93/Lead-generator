import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseStub, type StubStore } from "./__testutils__/supabaseStub";

import { MACHINE_LISTING_DEPLOYED_COLUMNS } from "./machineColumns";

const store: StubStore = {};
// machine_listings is column-checked against the DEPLOYED schema: any
// explicit select naming a column that does not exist fails the read,
// exactly as PostgREST does in the preview database.
const stub = createSupabaseStub(store, [], { columns: { machine_listings: MACHINE_LISTING_DEPLOYED_COLUMNS } });
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
import { catalogDetails, searchCatalog, searchCatalogDetailed, searchLocationServices, LOCATION_OFFERINGS } from "./catalogSearch";

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  pricingCalls.length = 0;
  store.coffee_products = [
    { id: "P1", name: "Lavazza Classico", sku: "SKU-1", description: "Medium roast", image_url: null, unit: "case", min_order_qty: 1, pack_quantity: 6, stock_status: "in_stock", active: true, category_id: "C1", sort_order: 1, coffee_categories: { name: "Coffee", slug: "coffee" }, price: 45, supplier_cost: 20 },
    { id: "P2", name: "Hidden Blend", sku: "SKU-2", description: "Hidden for tenant", image_url: null, unit: "case", min_order_qty: 1, pack_quantity: 6, stock_status: "in_stock", active: true, category_id: "C1", sort_order: 2, coffee_categories: { name: "Coffee", slug: "coffee" }, price: 50 },
    { id: "P3", name: "Inactive", sku: "SKU-3", description: "", image_url: null, unit: "case", min_order_qty: 1, pack_quantity: 6, stock_status: "in_stock", active: false, category_id: "C1", sort_order: 3, coffee_categories: null, price: 1 },
  ];
  store.storefront_tenant_hidden_products = [{ tenant_id: "TEN", product_id: "P2" }];
  store.coffee_categories = [{ id: "C1", slug: "coffee", name: "Coffee" }, { id: "C2", slug: "cups", name: "Cups" }];
  store.coffee_product_categories = [{ product_id: "P1", category_id: "C1" }];
  // Rows carry every DEPLOYED column (migrations 025/027/055/057/149) and
  // nothing from migration 150 — the shape the preview database returns.
  store.machine_listings = [
    { id: "M1", created_by: "U9", title: "AI Cooler", description: "Smart cooler", city: "Denver", state: "CO", machine_make: "Vendera", machine_model: "X1", machine_year: 2025, machine_type: "AI", condition: "new", quantity: 3, asking_price: 4999, includes_card_reader: true, includes_install: false, includes_delivery: true, photos: [], contact_email: "seller@example.com", contact_phone: "555", status: "active", admin_notes: "secret", created_at: "2026-01-01", updated_at: "2026-01-01", image_thumb_url: null, image_medium_url: null, image_main_url: null, buy_now_enabled: true, buy_now_price: 479900, delivery_fee_cents: 25000, manufacturer_partner_id: "MP1", wholesale_price_cents: 300000 },
    { id: "M2", status: "pending", title: "Not live", machine_type: "Combo", created_at: "2026-01-02" },
    { id: "M3", status: "active", title: "Snack Combo 3000", description: "Refurbished combo machine", machine_make: "Seaga", machine_model: "SC3000", machine_type: "Combo", condition: "good", quantity: 1, city: "Austin", state: "TX", asking_price: 2500, buy_now_enabled: false, buy_now_price: null, delivery_fee_cents: null, photos: ["https://cdn.example/snack.jpg"], created_at: "2025-12-01" },
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

describe("catalog service — coffee search hints", () => {
  const guest = { userId: null, storefront: null };
  it("matches the customer's words against name, description, and category instead of a strict ilike", async () => {
    // "coffee options" used to become ilike '%coffee options%' and return nothing.
    const items = await searchCatalog("coffee", { query: "Show me three coffee options", categorySlug: null, limit: 3 }, guest);
    expect(items.map((i) => i.product_id)).toEqual(["P1", "P2"]);
    const roast = await searchCatalog("coffee", { query: "medium roast", categorySlug: null, limit: 3 }, guest);
    expect(roast[0].product_id).toBe("P1");
  });

  it("falls back to browsing when no word matches, and says so", async () => {
    const { items, fallback } = await searchCatalogDetailed("coffee", { query: "zebra sprockets", categorySlug: null, limit: 3 }, guest);
    expect(items.map((i) => i.product_id)).toEqual(["P1", "P2"]);
    expect(fallback).toBe("query_unmatched");
  });

  it("resolves a category slug through the m2m links and primary category; an unknown slug is ignored rather than emptying the catalog", async () => {
    const exact = await searchCatalogDetailed("coffee", { query: null, categorySlug: "coffee", limit: 5 }, guest);
    expect(exact.items.map((i) => i.product_id)).toEqual(["P1", "P2"]);
    expect(exact.fallback).toBe("none");
    const empty = await searchCatalogDetailed("coffee", { query: null, categorySlug: "cups", limit: 5 }, guest);
    expect(empty.fallback).toBe("category_unknown");
    expect(empty.items.length).toBe(2);
    const unknown = await searchCatalogDetailed("coffee", { query: null, categorySlug: "does-not-exist", limit: 5 }, guest);
    expect(unknown.fallback).toBe("category_unknown");
    expect(unknown.items.length).toBe(2);
  });

  it("still applies every visibility rule under the new matching (inactive, tenant-hidden)", async () => {
    const items = await searchCatalog("coffee", { query: "coffee", categorySlug: null, limit: 10 }, { userId: "CUST", storefront: { tenantId: "TEN", customerProfileId: "CUST" } });
    expect(items.map((i) => i.product_id)).toEqual(["P1"]);
  });
});

describe("catalog service — machines", () => {
  it("selects only deployed columns: search, details, and comparison all read cleanly against the real column set", async () => {
    const items = await searchCatalog("machine", { query: null, categorySlug: null, limit: 10 }, { userId: null, storefront: null });
    expect(items.map((i) => i.product_id)).toEqual(["M1", "M3"]);
    expect(items[0].sku).toBeNull();
    const details = await catalogDetails("machine", ["M1", "M3"], { userId: null, storefront: null });
    expect(details.map((d) => d.product_id).sort()).toEqual(["M1", "M3"]);
    expect(details.find((d) => d.product_id === "M3")?.image_url).toBe("https://cdn.example/snack.jpg");
    expect(details.find((d) => d.product_id === "M3")?.attributes.map((a) => a.label)).toEqual(["Make", "Model", "Type", "Condition", "Quantity available", "City", "State"]);
  });

  it("matches machine words in-app and treats a machine type hint loosely", async () => {
    const machines = await searchCatalog("machine", { query: "What vending machines are for sale right now?", categorySlug: null, limit: 10 }, { userId: null, storefront: null });
    expect(machines.map((i) => i.product_id)).toEqual(["M1", "M3"]);
    const combo = await searchCatalogDetailed("machine", { query: null, categorySlug: "combo", limit: 10 }, { userId: null, storefront: null });
    expect(combo.items.map((i) => i.product_id)).toEqual(["M3"]);
    const cooler = await searchCatalog("machine", { query: "smart cooler", categorySlug: null, limit: 10 }, { userId: null, storefront: null });
    expect(cooler[0].product_id).toBe("M1");
  });

  it("passes rows through the public machine shape and drops private fields", async () => {
    const items = await searchCatalog("machine", { query: "cooler", categorySlug: null, limit: 10 }, { userId: null, storefront: null });
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
