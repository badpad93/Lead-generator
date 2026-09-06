import { describe, it, expect } from "vitest";
import { assertPublicShape, findProhibitedKey, PROHIBITED_OUTPUT_KEY_FRAGMENTS } from "./publicShapes";

describe("public shape guard", () => {
  it("detects prohibited keys at any depth", () => {
    expect(findProhibitedKey({ items: [{ name: "x", base_price_per_unit: 1 }] })).toBe("items[0].base_price_per_unit");
    expect(findProhibitedKey({ a: { b: { qb_invoice_id: "1" } } })).toBe("a.b.qb_invoice_id");
    expect(findProhibitedKey({ nested: [[{ WHOLESALE_price_cents: 2 }]] })).toBe("nested[0][0].WHOLESALE_price_cents");
  });

  it("passes clean shapes and throws on dirty ones", () => {
    expect(assertPublicShape({ name: "x", display_price: 1, attributes: [{ label: "Unit", value: "each" }] })).toBeTruthy();
    expect(() => assertPublicShape({ commission_total: 4 })).toThrow(/commission_total/);
  });

  it("covers every fragment the spec prohibits", () => {
    for (const frag of ["base_price", "commission", "unit_cost", "wholesale", "est_cost", "margin", "qb_", "quickbooks", "stripe_", "supplier_cost", "payout", "routing", "account_number", "admin_notes", "private_contact"]) {
      expect(PROHIBITED_OUTPUT_KEY_FRAGMENTS).toContain(frag);
    }
  });
});
