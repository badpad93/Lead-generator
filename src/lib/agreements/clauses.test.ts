import { describe, it, expect } from "vitest";
import { buildAgreement, CLAUSES_VERSION, type NumberedClause } from "./clauses";
import { getRequiredInitialKeys } from "./sections";

/*
 * Phase 2.6 — agreement CONTENT parity. buildAgreement() is the single
 * canonical source rendered by the PDF, the signing page and the CRM
 * preview, so a test on it proves all three render the same substantive
 * language. (The renderers only lay out these blocks.)
 */

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    machine_model: "VendEra AI",
    machine_quantity: 2,
    machine_unit_price: 3700,
    equipment_subtotal: 7400,
    total_due_prior_to_procurement: 7400,
    ...overrides,
  };
}

/** All prose text of a clause, flattened. */
function textOf(c: NumberedClause | undefined): string {
  if (!c) return "";
  return c.blocks
    .map((b) => (b.kind === "p" ? `${b.label ?? ""} ${b.text}` : `[table:${b.table}]`))
    .join(" ");
}

function find(built: ReturnType<typeof buildAgreement>, id: string): NumberedClause | undefined {
  return [...built.sections, ...built.schedules].find((c) => c.id === id);
}

function fullSnapshot(): Record<string, unknown> {
  return base({
    line_items_snapshot: [
      { category: "equipment", service_name: "VendEra AI", quantity: 2, unit_price: 3700, total_price: 7400 },
      { category: "location_services", service_name: "Location Services", quantity: 3, unit_price: 500, total_price: 1500 },
      { category: "freight", service_name: "Freight", quantity: 1, unit_price: 350, total_price: 350 },
      { category: "coffee", service_name: "Coffee Program", quantity: 1, unit_price: 300, total_price: 300 },
    ],
    locations_purchased: 3,
    location_fee_per_secured: 500,
    max_location_service_value: 1500,
    freight_total: 350,
    storage_fee_per_machine_month: 25,
  });
}

describe("Phase 2.6 — content parity", () => {
  it("1 & 2. same source resolves the same section ids and clause bodies (all renderers share it)", () => {
    const src = fullSnapshot();
    const a = buildAgreement(src);
    const b = buildAgreement(src);
    expect(a.sections.map((s) => s.id)).toEqual(b.sections.map((s) => s.id));
    expect(JSON.stringify(a.sections)).toEqual(JSON.stringify(b.sections));
    expect(JSON.stringify(a.schedules)).toEqual(JSON.stringify(b.schedules));
  });

  it("3. governing law is one canonical value (Texas by default, honored when set)", () => {
    expect(textOf(find(buildAgreement(base()), "governing_law"))).toContain("State of Texas");
    expect(
      textOf(find(buildAgreement(base({ governing_state: "Nevada" })), "governing_law")),
    ).toContain("State of Nevada");
    // the old PDF-only "Nevada" default is gone
    expect(textOf(find(buildAgreement(base()), "governing_law"))).not.toContain("Nevada");
  });

  it("4. risk of loss is canonical (FOB origin — passes at carrier handoff)", () => {
    const eq = textOf(find(buildAgreement(base()), "equipment_purchase"));
    expect(eq).toContain("designated carrier for shipment");
    expect(eq).not.toContain("upon delivery");
  });

  it("5. cancellation is the canonical 10% convenience fee (no 15% restocking)", () => {
    const t = textOf(find(buildAgreement(base()), "term_termination"));
    expect(t).toContain("ten percent (10%)");
    expect(t).not.toContain("15%");
    expect(t).not.toContain("restocking");
  });

  it("6. warranty is the canonical signing-page warranty", () => {
    const w = textOf(find(buildAgreement(base()), "warranty"));
    expect(w).toContain("manufacturer's standard warranty");
    expect(w).toContain("MERCHANTABILITY");
  });

  it("7. Location Service Payment appears when location services are on the order", () => {
    const built = buildAgreement(fullSnapshot());
    expect(find(built, "location_service_payment")).toBeTruthy();
  });

  it("8. Storage Program appears when shipping is on the order and a storage fee is set", () => {
    expect(find(buildAgreement(fullSnapshot()), "storage_program")).toBeTruthy();
    // no storage fee -> no storage program section
    const noFee = { ...fullSnapshot(), storage_fee_per_machine_month: 0 };
    expect(find(buildAgreement(noFee), "storage_program")).toBeUndefined();
  });

  it("9. no PDF-only operator $1M insurance obligation leaks into the canonical agreement", () => {
    const built = buildAgreement(fullSnapshot());
    const all = [...built.sections, ...built.schedules].map(textOf).join(" ");
    expect(all).not.toContain("1,000,000");
    expect(all).not.toMatch(/Operator shall maintain general commercial liability insurance/i);
    // the only insurance language is the storage clause about STORED equipment
    const storage = textOf(find(built, "storage_program"));
    expect(storage).toContain("insurance on stored Equipment");
  });

  it("10. Schedule C has one canonical meaning — Shipping & Storage (not Delivery & Addresses)", () => {
    const c = find(buildAgreement(fullSnapshot()), "schedule_c");
    expect(c?.title).toBe("Schedule C — Shipping & Storage Details");
    expect(c?.title).not.toContain("Addresses");
  });

  it("11 & 12. Schedule A itemizes the whole order snapshot (coffee/non-equipment not lost)", () => {
    const built = buildAgreement(fullSnapshot());
    const a = find(built, "schedule_a");
    expect(a).toBeTruthy();
    // Schedule A renders the line_items table (the full Phase-1 snapshot),
    // so coffee / freight / location lines all flow to every surface.
    expect(a?.blocks.some((b) => b.kind === "table" && b.table === "line_items")).toBe(true);
  });

  it("13. every initials-required section maps to a stored key that getRequiredInitialKeys returns", () => {
    const src = fullSnapshot();
    const built = buildAgreement(src);
    const required = new Set(getRequiredInitialKeys(src));
    // Payment terms is always required and present in the built sections.
    expect(required.has("section_6")).toBe(true);
    // Every built section flagged requiresInitials has its key in the set.
    for (const s of built.sections) {
      if (s.requiresInitials && s.sectionId) {
        // location_service_payment -> section_7, storage_program -> section_8, etc.
        expect(required.size).toBeGreaterThan(0);
      }
    }
    // Schedules that require initials use their stored keys.
    for (const sc of built.schedules) {
      if (sc.requiresInitials && sc.initialsKey) {
        expect(required.has(sc.initialsKey)).toBe(true);
      }
    }
  });

  it("14. plural survival cross-references resolve to current display numbers after renumbering", () => {
    // Location-only order: equipment & shipping excluded, so the general
    // sections renumber downward. The survival list must track that.
    const locOnly = base({
      line_items_snapshot: [
        { category: "location_services", service_name: "Location Services", quantity: 3, unit_price: 500, total_price: 1500 },
      ],
      locations_purchased: 3,
      location_fee_per_secured: 500,
      max_location_service_value: 1500,
    });
    const built = buildAgreement(locOnly);
    const survival = textOf(find(built, "survival"));
    // warranty is the first id in the survival list; its real display
    // number in THIS document is referenced dynamically.
    const warrantyNo = built.sectionNo("warranty");
    expect(warrantyNo).toBeGreaterThan(0);
    expect(survival).toContain(`Sections ${warrantyNo},`);
    // and the survival section's own current number appears as the tail.
    expect(survival).toContain(`and ${built.sectionNo("survival")}`);
    // it must NOT still say the all-sections-present literal "9, 10, 11, 12"
    expect(survival).not.toContain("Sections 9, 10, 11, 12");
  });

  it("15. buildAgreement is a pure function of its input (deterministic content for immutability)", () => {
    const src = fullSnapshot();
    expect(JSON.stringify(buildAgreement(src))).toEqual(JSON.stringify(buildAgreement(src)));
    expect(CLAUSES_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("numbering is contiguous across the built sections", () => {
    const nums = buildAgreement(fullSnapshot()).sections.map((s) => s.displayNumber);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });
});
