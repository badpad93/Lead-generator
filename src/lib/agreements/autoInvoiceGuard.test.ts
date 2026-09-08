import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { shouldAutoCreateOrderOnSign } from "./autoInvoiceGuard";
import { buildLineItemsSnapshot, agreementTotals, type LineItemLike } from "@/lib/pricing/lineItems";

/*
 * Phase 5C-a9 — orphan-safety for the sign-time auto-create/invoice path,
 * plus the #108 recovery-fixture commercial invariants.
 */

const base = {
  isLocationPlacement: false,
  autoSendInvoiceOnSigning: true,
  hasLinkedOrder: false,
  isReplacement: false,
};

describe("shouldAutoCreateOrderOnSign — only the legitimate from-scratch case", () => {
  it("allows a machine agreement with auto-send, no order, not a replacement", () => {
    expect(shouldAutoCreateOrderOnSign(base)).toBe(true);
  });

  it("blocks a REPLACEMENT with no linked order (orphaned-by-deletion case)", () => {
    expect(shouldAutoCreateOrderOnSign({ ...base, isReplacement: true })).toBe(false);
  });

  it("blocks when the agreement already has a linked order (linked path handles it, idempotently)", () => {
    expect(shouldAutoCreateOrderOnSign({ ...base, hasLinkedOrder: true })).toBe(false);
  });

  it("blocks when auto-send is off (e.g. an already-invoiced order's replacement)", () => {
    expect(shouldAutoCreateOrderOnSign({ ...base, autoSendInvoiceOnSigning: false })).toBe(false);
  });

  it("blocks location-placement agreements (they use their own path)", () => {
    expect(shouldAutoCreateOrderOnSign({ ...base, isLocationPlacement: true })).toBe(false);
  });

  it("the #108 replacement (auto-send off) can never auto-mint a duplicate", () => {
    // Its live shape: replacement, auto_send off, and — whether orphaned
    // (no order) or restored (linked) — both block the no-order mint.
    expect(shouldAutoCreateOrderOnSign({
      isLocationPlacement: false,
      autoSendInvoiceOnSigning: false,
      hasLinkedOrder: false,
      isReplacement: true,
    })).toBe(false);
    expect(shouldAutoCreateOrderOnSign({
      isLocationPlacement: false,
      autoSendInvoiceOnSigning: false,
      hasLinkedOrder: true,
      isReplacement: true,
    })).toBe(false);
  });
});

/* ---- source-level guard: the signing path uses the guard + detects replacements ---- */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");
const PDF = "src/lib/generateAgreementPdf.ts";

describe("generateAgreementPdf — signing path is orphan-safe", () => {
  const src = read(PDF);
  it("gates auto-create through shouldAutoCreateOrderOnSign", () => {
    expect(src).toContain("shouldAutoCreateOrderOnSign");
  });
  it("detects a replacement via the created_as_replacement activity", () => {
    expect(src).toContain("agreementIsReplacement");
    expect(src).toContain('"created_as_replacement"');
  });
  it("records why auto-invoice was skipped for an orphaned replacement", () => {
    expect(src).toContain('"auto_invoice_skipped"');
  });
});

/* ---- #108 recovery fixture: the 6 surviving snapshot lines ---- */

/** The exact 6 lines preserved on the replacement agreement snapshot —
 *  the strongest surviving commercial source for reconstructing #108. */
const RECOVERY_108: LineItemLike[] = [
  { item_type: "financing", service_name: "10/10/10 Financing", quantity: 1, unit_price: 0, total_price: 0 },
  { item_type: "machine_sale", service_name: "VendEra AI Cooler", quantity: 10, unit_price: 3700, total_price: 37000 },
  { item_type: "location_services", service_name: "Location Services 10/10/10", quantity: 10, unit_price: 400, total_price: 4000 },
  { item_type: "other", service_name: "Vending Machine Freight", description: "Freight for machine shipping", quantity: 10, unit_price: 500, total_price: 5000 },
  { item_type: "coffee_program", service_name: "Flavia C600 Brewer", quantity: 1, unit_price: 0, total_price: 0 },
  { item_type: "coffee_program", service_name: "Coffee Machine Freight", quantity: 1, unit_price: 99.99, total_price: 99.99 },
];

describe("#108 recovery fixture — commercial basis reconstructs exactly", () => {
  it("the six surviving lines sum to $46,099.99", () => {
    const snapshot = buildLineItemsSnapshot(RECOVERY_108);
    expect(snapshot).toHaveLength(6);
    const totals = agreementTotals(snapshot);
    expect(totals.totalDuePriorToProcurement).toBe(46099.99);
  });

  it("freight reconciles to $500/machine and $5,000 total; coffee freight stays separate", () => {
    const totals = agreementTotals(buildLineItemsSnapshot(RECOVERY_108));
    expect(totals.freightPerMachine).toBe(500);
    expect(totals.freightTotal).toBe(5000);
    expect(totals.byCategory.freight).toBe(5099.99); // 5000 vending + 99.99 coffee
    expect(totals.equipmentSubtotal).toBe(37000);
    expect(totals.maxLocationServiceValue).toBe(4000);
  });
});
