import { describe, it, expect } from "vitest";
import {
  resolveAgreementSections,
  createSectionNumberer,
  getRequiredInitialKeys,
  initialsKeyFor,
  type AgreementSectionSource,
} from "./sections";

/*
 * Phase 2 — agreement structure. These lock the invariant that inclusion
 * is deterministic (never defaults conditional clauses to true), that
 * display numbering is contiguous (no gaps when a conditional section is
 * skipped), and that initials bind to stable section ids regardless of
 * the display number a section ends up with.
 */

function snap(...categories: string[]): AgreementSectionSource {
  return {
    line_items_snapshot: categories.map((category) => ({ category })),
  };
}

/**
 * Mirror of the order in which the section-numbered documents (PDF and
 * signing page) assign numbers, so the tests exercise the same
 * contiguity the renderers rely on. Returns the ordered [id, number]
 * pairs that would be printed.
 */
function numberedSpine(ag: AgreementSectionSource): Array<[string, number]> {
  const sec = resolveAgreementSections(ag);
  const n = createSectionNumberer();
  const out: Array<[string, number]> = [];
  const add = (id: string) => out.push([id, n.assign(id)]);
  add("recitals");
  add("definitions");
  if (sec.equipment) add("equipment_purchase");
  if (sec.shipping) add("shipping_freight");
  if (sec.location) add("location_services");
  add("payment_terms");
  if (sec.location) add("location_service_payment");
  if (sec.storage) add("storage_program");
  // general spine (always present)
  for (const id of ["warranty", "governing_law", "notices", "acknowledgment"]) add(id);
  return out;
}

function numbers(spine: Array<[string, number]>): number[] {
  return spine.map(([, num]) => num);
}

function isContiguous(nums: number[]): boolean {
  return nums.every((v, i) => v === i + 1);
}

describe("agreement structure — deterministic inclusion", () => {
  it("TEST 7 — a missing snapshot does NOT default conditionals to true", () => {
    const sec = resolveAgreementSections({}); // no snapshot, no flags
    expect(sec.equipment).toBe(false);
    expect(sec.location).toBe(false);
    expect(sec.shipping).toBe(false);
    expect(sec.coffee).toBe(false);
    expect(sec.financing).toBe(false);
  });

  it("snapshot categories are authoritative over stale include_* flags", () => {
    // TEST 10 shape: a frozen agreement's structure comes from its
    // snapshot, not from mutable scalar flags.
    const ag: AgreementSectionSource = {
      ...snap("equipment"),
      include_location_services: true, // stale flag, but snapshot has no location
      include_shipping_storage: true,
    };
    const sec = resolveAgreementSections(ag);
    expect(sec.equipment).toBe(true);
    expect(sec.location).toBe(false);
    expect(sec.shipping).toBe(false);
  });

  it("narrow legacy fallback: no snapshot, unknown flag, scalar evidence", () => {
    const sec = resolveAgreementSections({ machine_quantity: 2 });
    expect(sec.equipment).toBe(true);
    // no evidence for the others
    expect(sec.location).toBe(false);
    expect(sec.shipping).toBe(false);
  });

  it("an explicit include flag of false wins over legacy evidence", () => {
    const sec = resolveAgreementSections({
      include_equipment: false,
      machine_quantity: 5,
    });
    expect(sec.equipment).toBe(false);
  });

  it("storage applies only when shipping applies AND a fee is set", () => {
    expect(resolveAgreementSections(snap("freight")).storage).toBe(false);
    expect(
      resolveAgreementSections({ ...snap("freight"), storage_fee_per_machine_month: 25 }).storage,
    ).toBe(true);
    // no shipping -> no storage even with a fee
    expect(
      resolveAgreementSections({ ...snap("equipment"), storage_fee_per_machine_month: 25 }).storage,
    ).toBe(false);
  });
});

describe("agreement structure — contiguous numbering", () => {
  it("TEST 1 — no conditional products: numbers are 1..N with no gaps", () => {
    const spine = numberedSpine(snap("other"));
    expect(isContiguous(numbers(spine))).toBe(true);
    // recitals=1, definitions=2, payment=3, then general
    expect(spine[0]).toEqual(["recitals", 1]);
    expect(spine[2]).toEqual(["payment_terms", 3]);
  });

  it("TEST 2 — equipment only: equipment included, location/shipping excluded, contiguous", () => {
    const spine = numberedSpine(snap("equipment"));
    const ids = spine.map(([id]) => id);
    expect(ids).toContain("equipment_purchase");
    expect(ids).not.toContain("location_services");
    expect(ids).not.toContain("shipping_freight");
    expect(isContiguous(numbers(spine))).toBe(true);
  });

  it("TEST 3 — location only: location included, equipment excluded, contiguous", () => {
    const spine = numberedSpine(snap("location_services"));
    const ids = spine.map(([id]) => id);
    expect(ids).toContain("location_services");
    expect(ids).toContain("location_service_payment");
    expect(ids).not.toContain("equipment_purchase");
    expect(isContiguous(numbers(spine))).toBe(true);
  });

  it("TEST 4 — shipping only: shipping included, others excluded, contiguous", () => {
    const spine = numberedSpine(snap("freight"));
    const ids = spine.map(([id]) => id);
    expect(ids).toContain("shipping_freight");
    expect(ids).not.toContain("equipment_purchase");
    expect(ids).not.toContain("location_services");
    expect(isContiguous(numbers(spine))).toBe(true);
  });

  it("TEST 5 — mixed order: every applicable section appears exactly once, contiguous", () => {
    const ag = {
      ...snap("equipment", "location_services", "freight", "coffee", "financing"),
      storage_fee_per_machine_month: 30,
    };
    const sec = resolveAgreementSections(ag);
    expect(sec).toMatchObject({
      equipment: true,
      location: true,
      shipping: true,
      storage: true,
      coffee: true,
      financing: true,
    });
    const spine = numberedSpine(ag);
    const ids = spine.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(isContiguous(numbers(spine))).toBe(true);
  });

  it("TEST 6 — all conditionals absent: general legal sections remain and are numbered", () => {
    const spine = numberedSpine(snap("other"));
    const ids = spine.map(([id]) => id);
    expect(ids).toContain("payment_terms");
    expect(ids).toContain("governing_law");
    expect(ids).toContain("acknowledgment");
    expect(isContiguous(numbers(spine))).toBe(true);
  });

  it("the numberer resolves cross-references to the current display number", () => {
    // location present -> location_services gets a real number; a stale
    // literal would not track that.
    const withLoc = createSectionNumberer();
    withLoc.assign("recitals");
    withLoc.assign("definitions");
    withLoc.assign("location_services");
    expect(withLoc.numberOf("location_services")).toBe(3);
    // excluded section resolves to undefined, not a wrong literal
    expect(withLoc.numberOf("equipment_purchase")).toBeUndefined();
  });
});

describe("agreement structure — initials bound to stable ids", () => {
  it("TEST 8 — inclusion is deterministic, so PDF and preview derive the same set", () => {
    const ag = snap("equipment", "location_services");
    const a = resolveAgreementSections(ag);
    const b = resolveAgreementSections(ag);
    expect(a).toEqual(b); // same input -> same structure for every renderer
  });

  it("TEST 9 — Payment Terms initials stay bound to section_6 across renumbering", () => {
    // Equipment-only: payment renders around section 4; location-only:
    // payment renders around section 4 too but after a different set.
    // Either way its stored initials key is stable.
    const equipmentOnly = getRequiredInitialKeys(snap("equipment"));
    const locationOnly = getRequiredInitialKeys(snap("location_services"));
    expect(equipmentOnly).toContain("section_6");
    expect(locationOnly).toContain("section_6");
    expect(initialsKeyFor("payment_terms")).toBe("section_6");
  });

  it("required initials follow the applicable sections (no default-true, no gaps of keys)", () => {
    expect(getRequiredInitialKeys(snap("equipment"))).toEqual([
      "section_3", // equipment
      "section_6", // payment (always)
      "schedule_a", // equipment schedule
    ]);
    expect(getRequiredInitialKeys(snap("location_services"))).toEqual([
      "section_5", // location
      "section_6", // payment
      "section_7", // location service payment
      "schedule_b", // location schedule
    ]);
    // missing snapshot -> only the always-required payment key
    expect(getRequiredInitialKeys({})).toEqual(["section_6"]);
    // location placement agreements have no per-section initials
    expect(getRequiredInitialKeys({ agreement_type: "location_placement" })).toEqual([]);
  });

  it("storage initials (section_8) appear only when storage applies", () => {
    expect(getRequiredInitialKeys(snap("freight"))).not.toContain("section_8");
    expect(
      getRequiredInitialKeys({ ...snap("freight"), storage_fee_per_machine_month: 20 }),
    ).toContain("section_8");
  });
});
