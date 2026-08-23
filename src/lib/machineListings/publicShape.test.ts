import { describe, expect, it } from "vitest";
import { pickPublicMachineListing, PUBLIC_MACHINE_LISTING_COLUMNS } from "./publicShape";

describe("pickPublicMachineListing (wholesale-pricing-is-private)", () => {
  it("drops wholesale_price_cents even when other columns are present", () => {
    const out = pickPublicMachineListing({
      id: "abc",
      title: "Combo Vending Machine",
      buy_now_price: 4200,
      wholesale_price_cents: 350000, // internal only — MUST NOT leak
    });
    expect(out).not.toHaveProperty("wholesale_price_cents");
    expect(out.title).toBe("Combo Vending Machine");
    expect(out.buy_now_price).toBe(4200);
  });

  it("drops admin_notes / contact_email / contact_phone / created_by / created_by identity fields", () => {
    const out = pickPublicMachineListing({
      id: "abc",
      title: "T",
      admin_notes: "seller has responded slowly historically",
      contact_email: "seller@example.com",
      contact_phone: "555-0100",
      created_by: "auth-uuid-here",
    });
    expect(out).not.toHaveProperty("admin_notes");
    expect(out).not.toHaveProperty("contact_email");
    expect(out).not.toHaveProperty("contact_phone");
    expect(out).not.toHaveProperty("created_by");
  });

  it("passes manufacturer_partner_id + manufacturer_display_name through (allowlisted)", () => {
    const out = pickPublicMachineListing({
      id: "abc",
      title: "T",
      manufacturer_partner_id: "mfr-uuid",
      manufacturer_display_name: "Acme Vending",
    });
    expect(out.manufacturer_partner_id).toBe("mfr-uuid");
    expect(out.manufacturer_display_name).toBe("Acme Vending");
  });

  it("preserves the profiles join subobject unchanged", () => {
    const profiles = { id: "p1", full_name: "Zach", company_name: "Acme", verified: true };
    const out = pickPublicMachineListing({ id: "abc", title: "T", profiles });
    expect(out.profiles).toEqual(profiles);
  });

  it("drops any future column not on the allowlist automatically", () => {
    // If a future migration adds `internal_risk_score` or similar and
    // a contributor forgets to gatekeep it, the allowlist still
    // protects — nothing untracked leaks.
    const out = pickPublicMachineListing({
      id: "abc",
      title: "T",
      internal_risk_score: 0.87,
      seller_notes_private: "…",
      brand_new_admin_column: "leaked?",
    });
    expect(out).not.toHaveProperty("internal_risk_score");
    expect(out).not.toHaveProperty("seller_notes_private");
    expect(out).not.toHaveProperty("brand_new_admin_column");
  });

  it("never includes any of the sensitive keys in PUBLIC_MACHINE_LISTING_COLUMNS", () => {
    // Meta-test: guarding against a contributor adding wholesale_
    // price_cents to the allowlist without meaning to.
    const forbidden = [
      "wholesale_price_cents",
      "admin_notes",
      "contact_email",
      "contact_phone",
      "created_by",
    ];
    for (const key of forbidden) {
      expect(PUBLIC_MACHINE_LISTING_COLUMNS.includes(key as never)).toBe(false);
    }
  });
});
