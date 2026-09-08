import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Catalog contract: the twelve approved rows, their commerce
 * classifications, the public projection (no accounting internals), and
 * the migration that seeds them.
 */
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: () => { throw new Error("unused"); } } }));
import { APPROVED_CATALOG_KEYS, catalogNotices, isCheckoutReady, toPublicCatalogItem, type CommerceCatalogItem } from "./catalog";
import { findProhibitedKey } from "@/lib/assistant/publicShapes";

const MIGRATION = readFileSync(join(process.cwd(), "supabase", "migrations", "20260907221651_catalog_items_commerce_metadata.sql"), "utf8");

export function fixtureItem(over: Partial<CommerceCatalogItem>): CommerceCatalogItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    catalog_key: "website-creation",
    name: "Website Creation",
    description: "Site build",
    item_type: "other",
    unit_price: 500,
    sku: "WS0001",
    active: true,
    commerce_kind: "direct_checkout",
    pricing_basis: "fixed_unit",
    tax_treatment: "unset",
    required_agreement: null,
    qualification_program: null,
    financing_program: null,
    add_on_parent_key: null,
    equipment_ownership: null,
    qb_item_id: null,
    ...over,
  };
}

/** The approved table, as seeded by the migration. */
export const APPROVED: Array<{ key: string; name: string; sku: string | null; price: number; kind: CommerceCatalogItem["commerce_kind"] }> = [
  { key: "financing-10-10-10", name: "10/10/10 Financing", sku: null, price: 0, kind: "application_required" },
  { key: "coffee-machine-freight", name: "Coffee Machine Freight", sku: null, price: 99.99, kind: "conditional_add_on" },
  { key: "financing-standard", name: "Financing", sku: null, price: 0, kind: "application_required" },
  { key: "flavia-c600-brewer", name: "Flavia C600 Brewer", sku: "c6000101", price: 0, kind: "agreement_required" },
  { key: "location-service-10-10-10", name: "Location Services 10/10/10", sku: "LS101010", price: 400, kind: "qualification_required" },
  { key: "location-service-deposit", name: "Location Services Deposit", sku: "LS100", price: 100, kind: "deposit_only" },
  { key: "location-service-tier-1", name: "Location Services Tier 1", sku: "101010", price: 500, kind: "qualification_required" },
  { key: "location-service-tier-2", name: "Location Services Tier 2", sku: "1010102", price: 800, kind: "qualification_required" },
  { key: "location-service-tier-3", name: "Location Services Tier 3", sku: "1010103", price: 1200, kind: "qualification_required" },
  { key: "vendera-ai-cooler", name: "VendEra AI Cooler", sku: "V000111", price: 3700, kind: "agreement_required" },
  { key: "vending-machine-freight", name: "Vending Machine Freight", sku: null, price: 500, kind: "conditional_add_on" },
  { key: "website-creation", name: "Website Creation", sku: "WS0001", price: 500, kind: "direct_checkout" },
];

describe("approved catalog records", () => {
  it("has exactly the twelve approved keys and the migration seeds each with the approved name, SKU, price, and kind", () => {
    expect([...APPROVED_CATALOG_KEYS].sort()).toEqual(APPROVED.map((a) => a.key).sort());
    for (const a of APPROVED) {
      const row = MIGRATION.split("\n").find((l) => l.includes(`"key":"${a.key}"`));
      expect(row, a.key).toBeDefined();
      expect(row).toContain(`"name":"${a.name}"`);
      expect(row).toContain(a.sku ? `"sku":"${a.sku}"` : `"sku":null`);
      expect(row).toContain(`"price":${a.price.toFixed(2)}`);
      expect(row).toContain(`"kind":"${a.kind}"`);
    }
  });

  it("the migration matches by exact SKU or exact name, asserts no duplicates, preserves ids and prices, and never uses names or SKUs elsewhere", () => {
    expect(MIGRATION).toContain("lower(sku) = lower(r.sku)");
    expect(MIGRATION).toContain("lower(btrim(name)) = lower(r.name)");
    expect(MIGRATION).toMatch(/RAISE EXCEPTION 'catalog_items: approved key % matches % existing rows/);
    expect(MIGRATION).toContain("Price is administrative data: never overwritten");
    expect(MIGRATION).not.toMatch(/UPDATE public\.catalog_items SET[^;]*unit_price\s*=/);
    expect(MIGRATION).toContain("expected 12 approved rows");
  });

  it("adds typed columns, a unique catalog_key, kind↔metadata consistency, RLS, and explicit REVOKEs; touches no other table", () => {
    for (const c of ["catalog_key", "commerce_kind", "pricing_basis", "qb_item_id", "tax_treatment", "required_agreement", "qualification_program", "financing_program", "add_on_parent_key", "equipment_ownership"]) {
      expect(MIGRATION).toContain(`ADD COLUMN IF NOT EXISTS ${c}`);
    }
    expect(MIGRATION).toContain("UNIQUE (catalog_key)");
    expect(MIGRATION).toContain("catalog_items_kind_metadata_ck");
    expect(MIGRATION).toContain("ENABLE ROW LEVEL SECURITY");
    expect(MIGRATION).toContain("REVOKE ALL ON TABLE public.catalog_items FROM anon");
    expect(MIGRATION).toContain("REVOKE ALL ON TABLE public.catalog_items FROM authenticated");
    const tables = new Set(MIGRATION.match(/(?:ALTER TABLE|UPDATE|INSERT INTO|FROM|ON) public\.(\w+)/g)?.map((m) => m.split("public.")[1]) ?? []);
    expect([...tables]).toEqual(["catalog_items"]);
  });

  it("freight rows are conditional add-ons bound to their parent, and financing rows carry no charge", () => {
    expect(MIGRATION).toContain('"key":"coffee-machine-freight"');
    expect(MIGRATION).toMatch(/"key":"coffee-machine-freight"[^\n]*"parent":"flavia-c600-brewer"/);
    expect(MIGRATION).toMatch(/"key":"vending-machine-freight"[^\n]*"parent":"vendera-ai-cooler"/);
    expect(MIGRATION).toMatch(/"key":"financing-10-10-10"[^\n]*"basis":"no_charge"/);
    expect(MIGRATION).toMatch(/"key":"financing-standard"[^\n]*"basis":"no_charge"/);
    expect(MIGRATION).toMatch(/"key":"flavia-c600-brewer"[^\n]*"ownership":"company_owned_loan"/);
  });
});

describe("public projection", () => {
  it("never exposes qb_item_id or tax treatment and passes the prohibited-key scan", () => {
    const pub = toPublicCatalogItem(fixtureItem({ qb_item_id: "QBO-ITEM-9", tax_treatment: "qbo_automated" }));
    expect(JSON.stringify(pub)).not.toContain("QBO-ITEM-9");
    expect("qb_item_id" in pub).toBe(false);
    expect("tax_treatment" in pub).toBe(false);
    expect(findProhibitedKey(pub)).toBeNull();
  });

  it("$0 financing is an application action, never a free checkout", () => {
    const pub = toPublicCatalogItem(fixtureItem({ catalog_key: "financing-standard", name: "Financing", sku: null, unit_price: 0, commerce_kind: "application_required", pricing_basis: "no_charge", financing_program: "standard", tax_treatment: "exempt" }));
    expect(pub.action).toBe("start_financing_application");
    expect(pub.display_price).toBeNull();
    expect(pub.pricing_mode).toBe("informational");
    expect(pub.href).toBe("/financing");
    expect(pub.notices.join(" ")).toMatch(/not free/);
    expect(pub.notices.join(" ")).toMatch(/never guaranteed/);
    expect(JSON.stringify(pub)).not.toMatch(/free (checkout|financing)/i);
  });

  it("the Flavia C600 carries the ownership disclaimer and cannot be checked out independently", () => {
    const pub = toPublicCatalogItem(fixtureItem({ catalog_key: "flavia-c600-brewer", unit_price: 0, commerce_kind: "agreement_required", required_agreement: "coffee_supply", equipment_ownership: "company_owned_loan" }));
    expect(pub.notices.join(" ")).toContain("Ownership does not transfer");
    expect(pub.notices.join(" ")).toContain("cannot be checked out on its own");
    expect(pub.requires_agreement).toBe("coffee_supply");
  });

  it("location tiers are qualification-only and 10/10/10 states its qualification requirement", () => {
    const tier = toPublicCatalogItem(fixtureItem({ catalog_key: "location-service-tier-2", unit_price: 800, commerce_kind: "qualification_required", qualification_program: "location_tier" }));
    expect(tier.action).toBe("request_qualification");
    expect(tier.pricing_mode).toBe("requires_qualification");
    expect(tier.notices.join(" ")).toContain("cannot select or check out a tier");
    const ttt = toPublicCatalogItem(fixtureItem({ catalog_key: "location-service-10-10-10", unit_price: 400, commerce_kind: "qualification_required", qualification_program: "ten_ten_ten" }));
    expect(ttt.notices.join(" ")).toContain("not a standalone");
    expect(ttt.display_price).toBe(400);
  });

  it("deposit and add-on rows describe their basis", () => {
    const dep = toPublicCatalogItem(fixtureItem({ catalog_key: "location-service-deposit", unit_price: 100, commerce_kind: "deposit_only", pricing_basis: "per_location" }));
    expect(dep.unit).toBe("per location");
    expect(dep.notices.join(" ")).toContain("$100.00 per requested location");
    const freight = toPublicCatalogItem(fixtureItem({ catalog_key: "vending-machine-freight", unit_price: 500, commerce_kind: "conditional_add_on", add_on_parent_key: "vendera-ai-cooler" }));
    expect(freight.action).toBe("auto_add_on");
    expect(freight.notices.join(" ")).toContain("one per unit of vendera ai cooler");
    expect(catalogNotices(fixtureItem({}))).toEqual([]);
  });

  it("checkout readiness requires both a QuickBooks Item and a decided tax treatment", () => {
    expect(isCheckoutReady(fixtureItem({})).missing).toEqual(["qb_item_id", "tax_treatment"]);
    expect(isCheckoutReady(fixtureItem({ qb_item_id: "X" })).missing).toEqual(["tax_treatment"]);
    expect(isCheckoutReady(fixtureItem({ qb_item_id: "X", tax_treatment: "qbo_automated" })).ready).toBe(true);
  });
});
