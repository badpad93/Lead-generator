import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: () => { throw new Error("unused"); } } }));
import { APPROVED_CATALOG, buildReadinessReport, suggestMappings } from "./catalogReadiness";
import { APPROVED_CATALOG_KEYS, type CommerceCatalogItem } from "./catalog";

/** The readiness report covers all twelve approved records with every required field. */
const row = (key: string, extra: Partial<CommerceCatalogItem> = {}): CommerceCatalogItem => {
  const a = APPROVED_CATALOG.find((x) => x.key === key)!;
  return { id: `id-${key}`, catalog_key: key, name: a.name, description: null, item_type: "other", unit_price: a.price, sku: a.sku, active: true, commerce_kind: a.kind, pricing_basis: a.price === 0 ? "no_charge" : "fixed_unit", tax_treatment: "unset", required_agreement: a.agreement, qualification_program: null, financing_program: null, add_on_parent_key: a.parent, equipment_ownership: null, qb_item_id: null, ...extra } as CommerceCatalogItem;
};

describe("buildReadinessReport", () => {
  it("lists all twelve keys with the approved price, behavior, agreement, freight relationship, mapping, tax, and reason, even when rows are missing", () => {
    const report = buildReadinessReport([]);
    expect(report.rows.map((r) => r.catalog_key)).toEqual([...APPROVED_CATALOG_KEYS]);
    expect(report.total).toBe(12);
    for (const r of report.rows) {
      expect(r.exists).toBe(false);
      expect(r.ready).toBe(false);
      expect(r.reason).toMatch(/Row missing/);
      expect(typeof r.approved_price).toBe("number");
      expect(r.behavior.length).toBeGreaterThan(0);
    }
    const cooler = report.rows.find((r) => r.catalog_key === "vendera-ai-cooler")!;
    expect(cooler.freight_relationship).toEqual({ role: "parent", add_on_keys: ["vending-machine-freight"] });
    expect(cooler.agreement_requirement).toBe("machine_purchase");
    expect(report.rows.find((r) => r.catalog_key === "coffee-machine-freight")!.freight_relationship).toEqual({ role: "add_on", parent_key: "flavia-c600-brewer" });
  });

  it("explains every not-ready cause and marks payable rows ready only with mapping and tax set at the approved price", () => {
    const rows = [
      row("website-creation", { qb_item_id: "12", tax_treatment: "qbo_automated" }),
      row("vendera-ai-cooler", { unit_price: 3500, qb_item_id: "13", tax_treatment: "exempt" }),
      row("vending-machine-freight", { active: false }),
      row("financing-standard"),
    ];
    const report = buildReadinessReport(rows);
    const by = (k: string) => report.rows.find((r) => r.catalog_key === k)!;
    expect(by("website-creation")).toMatchObject({ ready: true, qb_mapping_present: true, tax_treatment_present: true, price_matches: true, actual_price: 500, approved_price: 500 });
    expect(by("vendera-ai-cooler")).toMatchObject({ ready: false, price_matches: false, actual_price: 3500, approved_price: 3700 });
    expect(by("vendera-ai-cooler").reason).toMatch(/differs from approved 3700/);
    expect(by("vending-machine-freight").reason).toMatch(/inactive; .*mapping missing; tax treatment unset/);
    expect(by("financing-standard")).toMatchObject({ ready: true, payable: false });
    expect(by("financing-standard").reason).toMatch(/Never invoiced/);
    expect(report.ready).toBe(2);
    expect(report.not_ready).toBe(10);
  });
});

describe("suggestMappings", () => {
  it("suggests by exact SKU first, then exact normalized name, only when unique and active, and never applies anything", () => {
    const rows = [row("website-creation"), row("vendera-ai-cooler"), row("vending-machine-freight"), row("financing-standard")];
    const items = [
      { id: "1", name: "Web site creation", sku: "ws0001", active: true, type: "Service", taxable: true, sales_tax_code: null },
      { id: "2", name: "Vending Machine Freight", sku: null, active: true, type: "Service", taxable: true, sales_tax_code: null },
      { id: "3", name: "vending-machine-freight", sku: null, active: true, type: "Service", taxable: true, sales_tax_code: null },
      { id: "4", name: "VendEra AI Cooler", sku: "V000111", active: false, type: "Inventory", taxable: true, sales_tax_code: null },
      { id: "5", name: "Financing", sku: null, active: true, type: "Service", taxable: false, sales_tax_code: null },
    ];
    const s = suggestMappings(rows, items);
    expect(s).toEqual([{ catalog_key: "website-creation", qb_item_id: "1", qb_item_name: "Web site creation", basis: "exact_sku" }]);
    expect(rows.every((r) => r.qb_item_id === null)).toBe(true);
  });
});
