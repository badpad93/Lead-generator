import { describe, it, expect } from "vitest";
import {
  agreementTotals,
  buildLineItemsSnapshot,
  categorize,
  computeLineTotal,
  deriveAgreementSections,
  lineTotal,
  normalizeItemType,
  orderTotals,
  remainingBalance,
  sumLines,
} from "./lineItems";

describe("normalizeItemType", () => {
  it("folds the storefront mirror's vocabulary into the CRM's", () => {
    // src/lib/coffeeCrmMirror.ts writes these; the agreement gate only
    // ever looked for the CRM spellings.
    expect(normalizeItemType("coffee")).toBe("coffee_program");
    expect(normalizeItemType("shipping")).toBe("freight");
  });

  it("passes canonical values through untouched", () => {
    expect(normalizeItemType("machine_sale")).toBe("machine_sale");
    expect(normalizeItemType("location_services")).toBe("location_services");
  });

  it("falls back to 'other' for unknown, empty and null", () => {
    expect(normalizeItemType("something_new")).toBe("other");
    expect(normalizeItemType("")).toBe("other");
    expect(normalizeItemType(null)).toBe("other");
  });
});

describe("categorize", () => {
  it("rescues legacy 'other' rows by name", () => {
    // Order #86 carries a $500 line typed 'other' named
    // "Vending Machine Freight".
    expect(categorize({ item_type: "other", service_name: "Vending Machine Freight" })).toBe("freight");
    expect(categorize({ item_type: "other", service_name: "Location Services — 3 AI locations" })).toBe(
      "location_services",
    );
  });

  it("treats coffee-program freight as shipping, not a brewer", () => {
    // Reps and the catalog type lines like "Coffee Machine Freight" as
    // coffee_program. Left alone one of those drags the Equipment Loan
    // & Beverage Supply Agreement into a contract with no brewer on it.
    expect(categorize({ item_type: "coffee_program", service_name: "Coffee Machine Freight" })).toBe("freight");
    expect(categorize({ item_type: "coffee", service_name: "Coffee Machine Freight" })).toBe("freight");
    expect(categorize({ item_type: "coffee_program", service_name: "Flavia C600 Brewer" })).toBe("coffee");
  });

  it("never re-types a line that was typed deliberately", () => {
    // A machine literally named "...Freight" is still equipment.
    expect(categorize({ item_type: "machine_sale", service_name: "Freight Elevator Machine" })).toBe(
      "equipment",
    );
  });
});

describe("lineTotal", () => {
  it("applies the discount", () => {
    expect(computeLineTotal(2, 100, 10)).toBe(180);
  });

  it("keeps a legitimately $0 line at $0", () => {
    // The old `Number(total_price) || qty * unit_price` idiom repriced
    // a 100%-discounted line back to full, because 0 is falsy.
    expect(lineTotal({ quantity: 1, unit_price: 3700, discount_percent: 100, total_price: 0 })).toBe(0);
  });

  it("reads the legacy price-only shape", () => {
    // Orders 76/78/79/84/90: amount only in `price`.
    expect(lineTotal({ quantity: 1, unit_price: 0, total_price: 0, price: 1800 })).toBe(1800);
  });

  it("prefers a stored total over recomputing", () => {
    expect(lineTotal({ quantity: 4, unit_price: 99.99, total_price: 399.96 })).toBe(399.96);
  });

  it("recomputes when no total was ever stored", () => {
    expect(lineTotal({ quantity: 3, unit_price: 50, discount_percent: 0 })).toBe(150);
  });
});

describe("orderTotals", () => {
  const items = [
    { item_type: "machine_sale", quantity: 1, unit_price: 3700, total_price: 3700 },
    { item_type: "coffee", quantity: 4, unit_price: 99.99, total_price: 399.96 },
    { item_type: "coffee", quantity: 1, unit_price: 99.99, total_price: 99.99 },
    { item_type: "other", quantity: 1, unit_price: 500, total_price: 500, service_name: "Vending Machine Freight" },
  ];

  it("matches order #86's header exactly", () => {
    expect(sumLines(items)).toBe(4699.95);
    expect(orderTotals(items).upfrontTotal).toBe(4699.95);
  });

  it("holds deferred lines out of the upfront total", () => {
    const withDeferred = [
      ...items,
      { item_type: "location_services", quantity: 1, unit_price: 1200, total_price: 1200, status: "pending_fulfillment" },
    ];
    const totals = orderTotals(withDeferred);
    expect(totals.upfrontTotal).toBe(4699.95);
    expect(totals.deferredTotal).toBe(1200);
    expect(totals.grandTotal).toBe(5899.95);
  });
});

describe("remainingBalance", () => {
  it("keeps a paid deposit out of the remaining balance", () => {
    // Every item edit used to stamp remaining_balance = total, wiping
    // out a deposit the customer had already paid.
    expect(remainingBalance(4699.95, 1000, true)).toBe(3699.95);
    expect(remainingBalance(4699.95, 1000, false)).toBe(4699.95);
  });
});

describe("agreementTotals", () => {
  it("totals every line, not just equipment and freight", () => {
    // Agreement cab7d78d (order #95) reported $42,099.99 against an
    // order of $45,199.99 — the $4,000 location-services line was
    // printed in the PDF summary but left out of the total.
    const snapshot = buildLineItemsSnapshot([
      { item_type: "machine_sale", service_name: "VendEra AI Cooler", quantity: 10, unit_price: 3700, total_price: 37000 },
      { item_type: "location_services", service_name: "Location Services 10/10/10", quantity: 10, unit_price: 400, total_price: 4000 },
      { item_type: "shipping", service_name: "Freight", quantity: 1, unit_price: 5099.99, total_price: 5099.99 },
      { item_type: "coffee", service_name: "Coffee Machine Freight", quantity: 1, unit_price: 99.99, total_price: 99.99 },
    ]);
    const totals = agreementTotals(snapshot);

    expect(totals.totalDuePriorToProcurement).toBe(46199.98);
    expect(totals.equipmentSubtotal).toBe(37000);
    expect(totals.byCategory.location_services).toBe(4000);
    // "Coffee Machine Freight" is shipping, not a brewer — see the
    // coffee-freight rule in categorize().
    expect(totals.byCategory.coffee).toBe(0);
    expect(totals.freightTotal).toBe(5199.98);
  });

  it("is exactly the sum of its category buckets", () => {
    const snapshot = buildLineItemsSnapshot([
      { item_type: "machine_sale", quantity: 2, unit_price: 3700, total_price: 7400 },
      { item_type: "financing", quantity: 1, unit_price: 250, total_price: 250 },
      { item_type: "other", service_name: "Custom install", quantity: 1, unit_price: 125.5, total_price: 125.5 },
    ]);
    const totals = agreementTotals(snapshot);
    const bucketSum = Object.values(totals.byCategory).reduce((a, b) => a + b, 0);
    expect(totals.totalDuePriorToProcurement).toBe(Math.round(bucketSum * 100) / 100);
  });

  it("reports a weighted unit price for mixed-price equipment", () => {
    // The old code took the first line's unit price and let the rest
    // vanish, so the contract's unit price x quantity didn't reconcile
    // with its own subtotal.
    const snapshot = buildLineItemsSnapshot([
      { item_type: "machine_sale", quantity: 1, unit_price: 3700, total_price: 3700 },
      { item_type: "machine_sale", quantity: 1, unit_price: 4300, total_price: 4300 },
    ]);
    const totals = agreementTotals(snapshot);
    expect(totals.machineQuantity).toBe(2);
    expect(totals.machineUnitPrice).toBe(4000);
    expect(totals.machineUnitPrice * totals.machineQuantity).toBe(totals.equipmentSubtotal);
  });

  it("does not count a deferred balance line as another location", () => {
    // Order #95: 9 locations at $400 plus an $800 balance invoiced on
    // fulfillment. Counting the balance line's quantity made the
    // contract read "10 locations at $440".
    const snapshot = buildLineItemsSnapshot([
      { item_type: "location_services", service_name: "Location Services", quantity: 9, unit_price: 400, total_price: 3600 },
      { item_type: "location_services", service_name: "Remaining Balance", quantity: 1, unit_price: 800, total_price: 800, status: "pending_fulfillment" },
    ]);
    const totals = agreementTotals(snapshot);
    expect(totals.locationsPurchased).toBe(9);
    expect(totals.locationFeePerSecured).toBe(400);
    // The maximum service value is still the whole commitment.
    expect(totals.maxLocationServiceValue).toBe(4400);
    expect(totals.totalDuePriorToProcurement).toBe(3600);
  });

  it("invents nothing for an order with no freight line", () => {
    const snapshot = buildLineItemsSnapshot([
      { item_type: "machine_sale", quantity: 3, unit_price: 3700, total_price: 11100 },
    ]);
    const totals = agreementTotals(snapshot);
    expect(totals.freightTotal).toBe(0);
    expect(totals.totalDuePriorToProcurement).toBe(11100);
  });
});

describe("deriveAgreementSections", () => {
  it("turns on only the schedules the order calls for", () => {
    const snapshot = buildLineItemsSnapshot([
      { item_type: "location_services", quantity: 2, unit_price: 600, total_price: 1200 },
    ]);
    expect(deriveAgreementSections(snapshot)).toEqual({
      include_equipment: false,
      include_location_services: true,
      include_shipping_storage: false,
      include_financing: false,
      coffee_supply_required: false,
    });
  });

  it("does not require the supply agreement for a coffee freight line alone", () => {
    const snapshot = buildLineItemsSnapshot([
      { item_type: "coffee_program", service_name: "Coffee Machine Freight", quantity: 1, unit_price: 99.99, total_price: 99.99 },
    ]);
    expect(deriveAgreementSections(snapshot).coffee_supply_required).toBe(false);
    expect(deriveAgreementSections(snapshot).include_shipping_storage).toBe(true);
  });

  it("requires the beverage supply agreement for mirrored coffee lines", () => {
    // These arrive typed 'coffee', which the old gate never matched.
    const snapshot = buildLineItemsSnapshot([
      { item_type: "coffee", service_name: "Flavia C600 Brewer", quantity: 1, unit_price: 0, total_price: 0 },
    ]);
    expect(deriveAgreementSections(snapshot).coffee_supply_required).toBe(true);
  });
});

describe("buildLineItemsSnapshot", () => {
  it("preserves every line, whatever its type", () => {
    const snapshot = buildLineItemsSnapshot([
      { item_type: "machine_sale", service_name: "Cooler", quantity: 1, unit_price: 3700, total_price: 3700 },
      { item_type: "coffee", service_name: "Brewer", quantity: 1, unit_price: 0, total_price: 0 },
      { item_type: "financing", service_name: "10/10/10 Financing", quantity: 1, unit_price: 0, total_price: 0 },
      { item_type: "vendera_ai_cooler", service_name: "Second cooler", quantity: 1, unit_price: 900, total_price: 900 },
    ]);
    expect(snapshot).toHaveLength(4);
    expect(snapshot.map((l) => l.category)).toEqual(["equipment", "coffee", "financing", "equipment"]);
  });

  it("marks deferred lines so they stay out of the amount due", () => {
    const snapshot = buildLineItemsSnapshot([
      { item_type: "location_services", service_name: "Remaining balance", quantity: 1, unit_price: 800, total_price: 800, status: "pending_fulfillment" },
    ]);
    expect(snapshot[0].deferred).toBe(true);
    expect(agreementTotals(snapshot).totalDuePriorToProcurement).toBe(0);
    expect(agreementTotals(snapshot).deferredTotal).toBe(800);
  });
});
