import { describe, it, expect } from "vitest";
import {
  computeLineTotal,
  lineTotal,
  orderTotals,
  sumLines,
  agreementTotals,
  buildLineItemsSnapshot,
  type LineItemLike,
} from "./lineItems";
import {
  calculateLocationPrice,
  coerceBusinessHours,
  coerceMachinesRequested,
  DEFAULT_LOCATION_PRICE,
  DEFAULT_BUSINESS_HOURS,
  TEN_TEN_TEN_PRICE,
  type PricingInput,
} from "./locationPricing";

/*
 * Phase 1 — commercial correctness. These lock the invariant that a
 * QUOTE, ORDER, AGREEMENT and RECEIPT computed from the same line items
 * all agree, because every path now routes through the canonical
 * calculator (computeLineTotal / orderTotals / lineTotal) and the
 * location pricing engine (calculateLocationPrice).
 */

/** The exact expression the CREATE-order route now uses per line. */
function createPathLineTotal(i: { quantity: number; unit_price: number; discount_percent: number }): number {
  return computeLineTotal(i.quantity, i.unit_price, i.discount_percent);
}

/** The read path shared by edit/order/agreement/receipt reads. */
function readPathLineTotal(i: LineItemLike): number {
  return lineTotal(i);
}

function locInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    employees: 0,
    foot_traffic: 0,
    business_hours: "low",
    machines_requested: 1,
    ...overrides,
  };
}

describe("commercial correctness — line item money", () => {
  it("1. create/edit parity: create-path total equals read-path total", () => {
    const cases = [
      { quantity: 1, unit_price: 100, discount_percent: 0 },
      { quantity: 3, unit_price: 3700, discount_percent: 0 },
      { quantity: 2, unit_price: 250.5, discount_percent: 15 },
      { quantity: 1, unit_price: 0, discount_percent: 0 },
    ];
    for (const c of cases) {
      const created = createPathLineTotal(c);
      // A row written by the create path stores total_price = created,
      // which the edit/read path then reads back verbatim.
      const readBack = readPathLineTotal({ ...c, total_price: created });
      expect(readBack).toBe(created);
    }
  });

  it("2. a 20% discount takes a $100 line to $80", () => {
    expect(computeLineTotal(1, 100, 20)).toBe(80);
    expect(lineTotal({ quantity: 1, unit_price: 100, discount_percent: 20 })).toBe(80);
  });

  it("3. a 100% discount takes a line to $0 (not repriced to full)", () => {
    expect(computeLineTotal(1, 100, 100)).toBe(0);
    // Stored explicit 0 must be honoured on read.
    expect(lineTotal({ quantity: 1, unit_price: 100, discount_percent: 100, total_price: 0 })).toBe(0);
  });

  it("4. an explicit $0 stored total stays $0 (comped line)", () => {
    expect(lineTotal({ quantity: 1, unit_price: 3700, total_price: 0 })).toBe(0);
  });

  it("5. custom receipt line total matches the order line incl. discounts", () => {
    const orderItem: LineItemLike = {
      quantity: 2,
      unit_price: 100,
      discount_percent: 25,
      total_price: 150, // 2 * 100 * 0.75
    };
    // The order reads its stored total; the receipt recomputes from the
    // same qty / unit_price / discount via computeLineTotal.
    const orderTotal = lineTotal(orderItem);
    const receiptTotal = computeLineTotal(
      orderItem.quantity as number,
      orderItem.unit_price as number,
      orderItem.discount_percent as number,
    );
    expect(receiptTotal).toBe(orderTotal);
    expect(receiptTotal).toBe(150);
  });

  it("11. mixed order: order total equals agreement snapshot grand total", () => {
    const items: LineItemLike[] = [
      { item_type: "machine_sale", service_name: "VendEra AI", quantity: 2, unit_price: 3700, discount_percent: 0 },
      { item_type: "location_services", service_name: "Location Services", quantity: 3, unit_price: 500, discount_percent: 0 },
      { item_type: "coffee_program", service_name: "Coffee Program", quantity: 1, unit_price: 300, discount_percent: 10 },
      { item_type: "other", service_name: "Comped extra", quantity: 1, unit_price: 250, total_price: 0 },
    ];
    const oTotals = orderTotals(items);
    const snapshot = buildLineItemsSnapshot(items);
    const aTotals = agreementTotals(snapshot);
    expect(aTotals.grandTotal).toBe(oTotals.grandTotal);
    // sanity: 7400 + 1500 + 270 + 0
    expect(oTotals.grandTotal).toBe(9170);
  });

  it("12. no regression: order editing keeps a stable total", () => {
    const items: LineItemLike[] = [
      { quantity: 1, unit_price: 3700, discount_percent: 0, total_price: 3700 },
      { quantity: 3, unit_price: 500, discount_percent: 0, total_price: 1500 },
    ];
    expect(sumLines(items)).toBe(5200);
    expect(orderTotals(items).grandTotal).toBe(5200);
  });
});

describe("commercial correctness — location pricing single source", () => {
  it("6. the same normalized input prices identically across caller default paths", () => {
    // One caller had a missing value, another an invalid string; both
    // now normalize to the SAME default and therefore the same price.
    const a = calculateLocationPrice(locInput({ business_hours: coerceBusinessHours(undefined), machines_requested: coerceMachinesRequested(undefined) }));
    const b = calculateLocationPrice(locInput({ business_hours: coerceBusinessHours("garbage"), machines_requested: coerceMachinesRequested(0) }));
    expect(coerceBusinessHours(undefined)).toBe(DEFAULT_BUSINESS_HOURS);
    expect(a.price).toBe(b.price);
  });

  it("7. a basic / default location prices at $500", () => {
    expect(calculateLocationPrice(locInput()).price).toBe(500);
    expect(DEFAULT_LOCATION_PRICE).toBe(500);
  });

  it("8. an elite location preserves the higher tier price ($1200)", () => {
    const r = calculateLocationPrice(locInput({ employees: 500, foot_traffic: 500, business_hours: "24/7", machines_requested: 4 }));
    expect(r.tier).toBe(3);
    expect(r.price).toBe(1200);
  });

  it("9. the 10/10/10 prepaid deal preserves the canonical $400", () => {
    const r = calculateLocationPrice(locInput({ is_ten_ten_ten: true }));
    expect(r.price).toBe(TEN_TEN_TEN_PRICE);
    expect(r.price).toBe(400);
  });

  it("10. agreement creation default no longer substitutes a phantom $400", () => {
    // The standalone builder now falls back to the engine's single
    // source (DEFAULT_LOCATION_PRICE), never the old magic 400.
    expect(DEFAULT_LOCATION_PRICE).not.toBe(400);
    expect(DEFAULT_LOCATION_PRICE).toBe(500);
  });
});
