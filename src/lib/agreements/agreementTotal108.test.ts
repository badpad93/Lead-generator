import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildLineItemsSnapshot,
  agreementTotals,
  type LineItemLike,
} from "@/lib/pricing/lineItems";

/* Phase 5C-a10 Defect 1 — the grand total is canonical everywhere. The bug:
 * a scalar-only reconstruction (equipment + freight + location = 46,000)
 * dropped the $99.99 coffee-machine freight. agreementTotals(snapshot) is
 * the single source of truth (= 46,099.99). */

/** Exact live Order #108 line items. */
const ORDER_108: LineItemLike[] = [
  { item_type: "financing", service_name: "10/10/10 Financing", quantity: 1, unit_price: 0, total_price: 0 },
  { item_type: "machine_sale", service_name: "VendEra AI Cooler", quantity: 10, unit_price: 3700, total_price: 37000 },
  { item_type: "location_services", service_name: "Location Services 10/10/10", quantity: 10, unit_price: 400, total_price: 4000 },
  { item_type: "other", service_name: "Vending Machine Freight", description: "Freight for machine shipping", quantity: 10, unit_price: 500, total_price: 5000 },
  { item_type: "coffee_program", service_name: "Flavia C600 Brewer", quantity: 1, unit_price: 0, total_price: 0 },
  { item_type: "coffee_program", service_name: "Coffee Machine Freight", quantity: 1, unit_price: 99.99, total_price: 99.99 },
];

describe("#108 fixture — canonical total is $46,099.99", () => {
  const snapshot = buildLineItemsSnapshot(ORDER_108);
  const totals = agreementTotals(snapshot);

  it("each component reconciles", () => {
    expect(totals.equipmentSubtotal).toBe(37000);
    expect(totals.maxLocationServiceValue).toBe(4000);
    expect(totals.freightTotal).toBe(5000); // vending freight only
    expect(totals.freightPerMachine).toBe(500);
    expect(totals.byCategory.coffee).toBe(0); // brewer $0
    expect(totals.byCategory.freight).toBe(5099.99); // vending 5000 + coffee 99.99
    expect(totals.byCategory.financing).toBe(0);
  });

  it("TOTAL includes the coffee freight — 46,099.99, never 46,000", () => {
    expect(totals.totalDuePriorToProcurement).toBe(46099.99);
    expect(totals.totalDuePriorToProcurement).not.toBe(46000);
  });

  it("round-trip: re-deriving the same snapshot preserves 46,099.99 (opening/saving a draft cannot corrupt it)", () => {
    // "save without changing commercial items" re-runs the same canonical
    // calc on the same snapshot — the total is stable.
    const again = agreementTotals(buildLineItemsSnapshot(ORDER_108));
    expect(again.totalDuePriorToProcurement).toBe(46099.99);
    // and the scalar-only formula the UI must NOT use would give 46,000:
    const scalarOnly = 37000 + 5000 + 4000;
    expect(scalarOnly).toBe(46000);
    expect(again.totalDuePriorToProcurement).not.toBe(scalarOnly);
  });
});

/* ---- source guards: every surface derives the total canonically ---- */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("all renderers use the canonical total source", () => {
  it("admin form computes the total from agreementTotals(snapshot), not a scalar sum", () => {
    const src = read("src/app/sales/agreements/[id]/page.tsx");
    expect(src).toContain("agreementTotals(");
    expect(src).toContain("agreement?.line_items_snapshot");
    expect(src).toContain("totalDue: t.totalDuePriorToProcurement");
  });
  it("PATCH route recomputes from the snapshot via agreementTotals", () => {
    const src = read("src/app/api/sales/agreements/[id]/route.ts");
    expect(src).toContain("agreementTotals(snapshot)");
    expect(src).toContain("total_due_prior_to_procurement = totals.totalDuePriorToProcurement");
  });
  it("customer signing page + PDF read the stored (canonical) total_due_prior_to_procurement", () => {
    expect(read("src/app/sign/[token]/page.tsx")).toContain("agreement.total_due_prior_to_procurement");
    expect(read("src/lib/generateAgreementPdf.ts")).toContain("total_due_prior_to_procurement");
  });
});
