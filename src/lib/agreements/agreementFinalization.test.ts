// Pin a negative-UTC-offset zone so the effective-date test would catch the
// off-by-one bug (must be set before any Date usage).
process.env.TZ = "America/Chicago";

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildAgreement } from "./clauses";
import { formatContractDate } from "./formatDate";
import {
  buildLineItemsSnapshot,
  agreementTotals,
  type LineItemLike,
} from "@/lib/pricing/lineItems";

/*
 * Phase — agreement finalization audit. Fixtures mirror Order #108:
 * 10× VendEra AI Cooler @3700, 10× Location Services @400, Vending Machine
 * Freight 10×$500, Coffee Machine Freight 1×$99.99, $0 brewer, $0 financing.
 */
const order108Items: LineItemLike[] = [
  { item_type: "vendera_ai_cooler", service_name: "VendEra AI Cooler", quantity: 10, unit_price: 3700, total_price: 37000 },
  { item_type: "location_services", service_name: "Location Services", quantity: 10, unit_price: 400, total_price: 4000 },
  { item_type: "freight", service_name: "Vending Machine Freight", quantity: 10, unit_price: 500, total_price: 5000 },
  { item_type: "coffee_program", service_name: "Coffee Machine Freight", quantity: 1, unit_price: 99.99, total_price: 99.99 },
  { item_type: "coffee_program", service_name: "Flavia C600 Brewer", quantity: 1, unit_price: 0, total_price: 0 },
  { item_type: "financing", service_name: "10/10/10 Financing", quantity: 1, unit_price: 0, total_price: 0 },
];

/** Collect all displayable prose (label + text) from a built section. */
function sectionText(section: { blocks: Array<{ kind: string; label?: string; text?: string }> }): string {
  return section.blocks
    .filter((b) => b.kind === "p")
    .map((b) => `${b.label ?? ""} ${b.text ?? ""}`)
    .join("\n");
}

describe("Freight (defect 1) — vending rate excludes coffee freight", () => {
  const snapshot = buildLineItemsSnapshot(order108Items);
  const totals = agreementTotals(snapshot);

  it("per-machine freight is $500, never the $510 blended rate", () => {
    expect(totals.freightPerMachine).toBe(500);
    expect(totals.freightPerMachine).not.toBe(510);
  });

  it("machine freight total is the vending freight only ($5,000)", () => {
    expect(totals.freightTotal).toBe(5000);
  });

  it("coffee freight is still carried as its own snapshot line ($99.99)", () => {
    const coffeeFreight = snapshot.find((l) => l.service_name === "Coffee Machine Freight");
    expect(coffeeFreight?.total_price).toBe(99.99);
    // It is categorized as freight but keeps its coffee_program item_type,
    // which is why it is excluded from the per-machine rate.
    expect(coffeeFreight?.category).toBe("freight");
    expect(coffeeFreight?.item_type).toBe("coffee_program");
  });

  it("agreement total is unchanged at $46,099.99 (coffee freight still counts)", () => {
    expect(totals.totalDuePriorToProcurement).toBe(46099.99);
  });

  it("Schedule A carries every commercial line deterministically (no folding)", () => {
    // 6 lines in → 6 lines rendered (incl. $0 brewer/financing and both freights).
    expect(snapshot).toHaveLength(order108Items.length);
  });
});

describe("Section numbering (defect 3) — subsection prefix == heading number", () => {
  // Drop equipment (snapshot without an equipment line) so every later
  // section's heading number shifts down; the old hardcoded literals would
  // then mismatch.
  const noEquip = buildAgreement({
    line_items_snapshot: buildLineItemsSnapshot([
      { item_type: "location_services", service_name: "Location Services", quantity: 5, unit_price: 400, total_price: 2000 },
      { item_type: "freight", service_name: "Vending Machine Freight", quantity: 5, unit_price: 500, total_price: 2500 },
    ]),
    max_location_service_value: 2000,
  });

  it("every labeled subsection's section component equals its section's displayNumber", () => {
    const mismatches: string[] = [];
    for (const section of noEquip.sections) {
      for (const b of section.blocks) {
        if (b.kind !== "p" || !b.label) continue;
        const m = /^(\d+)\.(\d+)/.exec(b.label);
        if (m && Number(m[1]) !== section.displayNumber) {
          mismatches.push(`${section.title} (#${section.displayNumber}): "${b.label}"`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("dropping equipment actually shifts numbering (warranty is not stuck at 9)", () => {
    const warranty = noEquip.sections.find((s) => s.id === "warranty");
    expect(warranty).toBeTruthy();
    // With equipment excluded, warranty shifts below its full-inclusion slot.
    expect(warranty!.displayNumber).toBeLessThan(9);
  });
});

describe("Section 0 (defect 4) — no reference ever resolves to Section 0", () => {
  // Shipping applies (freight line) but no storage fee → storage_program
  // section is absent, so the Storage Program definition must not say
  // "Section 0".
  const built = buildAgreement({
    line_items_snapshot: buildLineItemsSnapshot([
      { item_type: "vendera_ai_cooler", service_name: "VendEra AI Cooler", quantity: 2, unit_price: 3700, total_price: 7400 },
      { item_type: "freight", service_name: "Vending Machine Freight", quantity: 2, unit_price: 500, total_price: 1000 },
    ]),
    storage_fee_per_machine_month: 0,
  });

  it("no section or schedule text contains 'Section 0'", () => {
    const all = [...built.sections, ...built.schedules].map(sectionText).join("\n");
    expect(all).not.toContain("Section 0");
  });

  it("the Storage Program definition points at Schedule C alone when no storage section exists", () => {
    const defs = built.sections.find((s) => s.id === "definitions");
    expect(sectionText(defs!)).toContain("as further described in Schedule C.");
  });
});

describe("Location payment (defect 2) — Section 6 / Section 7 do not double-bill", () => {
  const locSnapshot = buildLineItemsSnapshot([
    { item_type: "location_services", service_name: "Location Services", quantity: 10, unit_price: 400, total_price: 4000 },
  ]);

  it("prepaid (not deposit-only): locations are included in Total Due, not re-invoiced on delivery", () => {
    const built = buildAgreement({
      line_items_snapshot: locSnapshot,
      max_location_service_value: 4000,
      location_services_deposit_only: false,
    });
    const pay = built.sections.find((s) => s.id === "location_service_payment");
    const text = sectionText(pay!);
    expect(text).toContain("included in the Total Amount Due Prior to Procurement");
    expect(text).toContain("shall not separately invoice Buyer for Location Services upon delivery");
    expect(text).not.toContain("Due within 5 business days");
    expect(text).not.toContain("upon delivery of each Secured Location");
  });

  it("deposit-only (deferred): keeps deposit + remaining-balance per-location invoicing", () => {
    const built = buildAgreement({
      line_items_snapshot: locSnapshot,
      max_location_service_value: 4000,
      location_services_deposit_only: true,
      location_services_deposit_amount: 1000,
    });
    const pay = built.sections.find((s) => s.id === "location_service_payment");
    const text = sectionText(pay!);
    expect(text).toContain("upon delivery of each Secured Location");
    expect(text).toContain("remaining balance");
  });
});

describe("UI copy (defect 7) — agreement → signature → invoice", () => {
  it("the order-page agreement panel no longer says 'along with the invoice'", () => {
    const src = readFileSync(
      new URL("../../app/sales/orders/[id]/page.tsx", import.meta.url),
      "utf8",
    );
    expect(src).not.toContain("along with the invoice");
    expect(src).toContain("The invoice is sent automatically once the customer signs.");
  });
});

describe("Effective date (defect 6) — no off-by-one shift", () => {
  it("a date-only string renders its own calendar day (not the day before)", () => {
    expect(formatContractDate("2026-09-07")).toBe("September 7, 2026");
  });
  it("null renders the fallback", () => {
    expect(formatContractDate(null)).toBe("________________");
    expect(formatContractDate(null, "—")).toBe("—");
  });
});
