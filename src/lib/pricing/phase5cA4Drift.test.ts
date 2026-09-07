import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  computeLineTotal,
  orderTotals,
  agreementTotals,
  buildLineItemsSnapshot,
  round2,
  type LineItemLike,
} from "./lineItems";

/*
 * Phase 5C-a4 — prevent CURRENT code from producing new commercial-integrity
 * mismatches. There is no DB/DOM in this env, so each fix is asserted two
 * ways: (1) the corrected line-item representation is rebuilt from the
 * canonical calculator and checked to satisfy the integrity invariant
 * (order header == sum of non-deferred total_price; agreement total ==
 * agreementTotals(snapshot)), and (2) source-level regression guards assert
 * the affected routes now route through the canonical calculator / resync
 * and preserve the agreement freeze behavior.
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

const COFFEE_MIRROR = "src/lib/coffeeCrmMirror.ts";
const REQUEST_LOCATION = "src/app/api/request-location/route.ts";
const DEALS_FINALIZE = "src/app/api/sales/deals/[id]/finalize/route.ts";
const DEALS_PATCH = "src/app/api/sales/deals/[id]/route.ts";
const AGREEMENT_PATCH = "src/app/api/sales/agreements/[id]/route.ts";

/* ------------------------------------------------------------------ */
/*  Fix 1 — coffee mirror: shipping counted exactly once              */
/* ------------------------------------------------------------------ */

/** Mirror of the corrected coffeeCrmMirror representation: product lines
 *  carry MERCHANDISE ONLY (unit_price * quantity), and shipping is a single
 *  standalone line. Header = coffee_orders.total = merchandise subtotal +
 *  shipping. */
function coffeeMirrorLines(
  items: Array<{ quantity: number; unit_price: number }>,
  shippingEstimate: number,
): LineItemLike[] {
  const lines: LineItemLike[] = items.map((i) => ({
    item_type: "coffee",
    quantity: i.quantity,
    unit_price: i.unit_price,
    discount_percent: 0,
    total_price: computeLineTotal(i.quantity, i.unit_price, 0),
    status: "paid",
  }));
  if (shippingEstimate > 0) {
    lines.push({
      item_type: "shipping",
      quantity: 1,
      unit_price: shippingEstimate,
      discount_percent: 0,
      total_price: round2(shippingEstimate),
      status: "paid",
    });
  }
  return lines;
}

const coffeeHeader = (
  items: Array<{ quantity: number; unit_price: number }>,
  shipping: number,
) => round2(items.reduce((s, i) => s + i.unit_price * i.quantity, 0) + shipping);

const shippingLineCount = (lines: LineItemLike[]) =>
  lines.filter((l) => l.item_type === "shipping").length;

describe("Phase 5C-a4 Fix 1 — coffee mirror counts shipping exactly once", () => {
  it("product lines + one shipping line == header", () => {
    const items = [{ quantity: 2, unit_price: 30 }];
    const shipping = 19.99;
    const lines = coffeeMirrorLines(items, shipping);
    expect(shippingLineCount(lines)).toBe(1);
    expect(orderTotals(lines).upfrontTotal).toBe(coffeeHeader(items, shipping)); // 79.99
  });

  it("$0 / free brewer with shipping: no hidden/double shipping", () => {
    const items = [{ quantity: 1, unit_price: 0 }];
    const shipping = 39.99;
    const lines = coffeeMirrorLines(items, shipping);
    expect(shippingLineCount(lines)).toBe(1);
    expect(orderTotals(lines).upfrontTotal).toBe(39.99);
  });

  it("multiple coffee quantities: shipping still appears once", () => {
    const items = [
      { quantity: 3, unit_price: 40 },
      { quantity: 2, unit_price: 25 },
    ];
    const shipping = 119.97;
    const lines = coffeeMirrorLines(items, shipping);
    expect(shippingLineCount(lines)).toBe(1);
    expect(orderTotals(lines).upfrontTotal).toBe(coffeeHeader(items, shipping)); // 289.97
  });

  it("regression: old double-count made delta == shipping; fix makes it 0", () => {
    // The confirmed live deltas ($19.99 / $39.99 / $119.97 / $39.99) each
    // equalled the shipping line. Old mirror: product total_price = the
    // shipping-inclusive line_total, PLUS a separate shipping line.
    const items = [{ quantity: 2, unit_price: 30 }];
    const shipping = 19.99;
    const header = coffeeHeader(items, shipping); // 79.99
    const bundledLineTotal = 30 * 2 + shipping; // 79.99 (shipping baked in)
    const buggyLines: LineItemLike[] = [
      { total_price: bundledLineTotal, status: "paid" },
      { total_price: shipping, status: "paid" },
    ];
    expect(round2(header - orderTotals(buggyLines).upfrontTotal)).toBe(-19.99);
    const fixedLines = coffeeMirrorLines(items, shipping);
    expect(round2(header - orderTotals(fixedLines).upfrontTotal)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Fix 2 — request-location deposit line persists canonically        */
/* ------------------------------------------------------------------ */

/** Mirror of the corrected request-location deposit item. Commercial basis
 *  is the DEPOSIT ONLY ($100/location); header total_value == deposit. */
function requestLocationLine(machineCount: number, perLocation = 100): LineItemLike {
  return {
    item_type: "location_services",
    quantity: machineCount,
    unit_price: perLocation,
    discount_percent: 0,
    total_price: computeLineTotal(machineCount, perLocation, 0),
    status: "pending", // due now — NOT pending_fulfillment
  };
}

describe("Phase 5C-a4 Fix 2 — request-location deposit line", () => {
  for (const mc of [1, 3, 10]) {
    it(`${mc} location(s): total_price persisted and line basis == header basis`, () => {
      const header = mc * 100; // depositDollars
      const line = requestLocationLine(mc);
      expect(line.total_price).toBe(header);
      // Non-deferred, so it counts toward the integrity line total.
      expect(orderTotals([line]).upfrontTotal).toBe(header);
    });
  }

  it("deposit line is not deferred (would otherwise re-create the mismatch)", () => {
    expect(requestLocationLine(5).status).not.toBe("pending_fulfillment");
  });
});

/* ------------------------------------------------------------------ */
/*  Fix 3 — deals → order items go through the canonical calculator   */
/* ------------------------------------------------------------------ */

/** Mirror of the corrected deals finalize/PATCH item build. */
function dealOrderLines(services: Array<{ service_name: string; price: number }>): LineItemLike[] {
  return services.map((s) => ({
    item_type: "other",
    quantity: 1,
    unit_price: Number(s.price),
    discount_percent: 0,
    total_price: computeLineTotal(1, Number(s.price), 0),
  }));
}

describe("Phase 5C-a4 Fix 3 — deals order items canonicalized", () => {
  it("finalize: total_price populated and header == lines", () => {
    const services = [
      { service_name: "Machine", price: 500 },
      { service_name: "Install", price: 1200.5 },
    ];
    const total = round2(services.reduce((s, x) => s + x.price, 0));
    const lines = dealOrderLines(services);
    lines.forEach((l, i) => expect(l.total_price).toBe(round2(services[i].price)));
    expect(orderTotals(lines).upfrontTotal).toBe(total); // 1700.5
  });

  it("PATCH auto-create: same canonical population", () => {
    const services = [{ service_name: "Service", price: 3700 }];
    const lines = dealOrderLines(services);
    expect(lines[0].total_price).toBe(3700);
    expect(orderTotals(lines).upfrontTotal).toBe(3700);
  });
});

/* ------------------------------------------------------------------ */
/*  Fix 4 — agreement snapshot authoritative; freeze preserved        */
/* ------------------------------------------------------------------ */

describe("Phase 5C-a4 Fix 4 — agreement totals controlled by snapshot", () => {
  it("draft with snapshot: agreementTotals controls the total (scalars cannot diverge)", () => {
    const snapshot = buildLineItemsSnapshot([
      { item_type: "machine_sale", service_name: "VendEra AI", quantity: 10, unit_price: 3700, total_price: 37000 },
      { item_type: "location_services", service_name: "Location Services", quantity: 10, unit_price: 400, total_price: 4000 },
      { item_type: "freight", service_name: "Vending Machine Freight", quantity: 1, unit_price: 5000, total_price: 5000 },
      { item_type: "other", service_name: "Website", quantity: 1, unit_price: 400, total_price: 400 },
      { item_type: "coffee_program", service_name: "Coffee Machine Freight", quantity: 1, unit_price: 99.99, total_price: 99.99 },
    ]);
    const totals = agreementTotals(snapshot);
    // Mirrors the signed-agreement snapshot: the calculator-controlled total
    // is 46,499.99 — never the frozen scalar 44,500 the old code could leave.
    expect(totals.totalDuePriorToProcurement).toBe(46499.99);
    const additive = round2(
      snapshot.filter((l) => !l.deferred).reduce((s, l) => s + l.total_price, 0),
    );
    expect(totals.totalDuePriorToProcurement).toBe(additive);
  });

  it("PATCH route writes total from agreementTotals(snapshot) when a snapshot exists", () => {
    const src = read(AGREEMENT_PATCH);
    expect(src).toContain("agreementTotals(snapshot)");
    expect(src).toContain("total_due_prior_to_procurement = totals.totalDuePriorToProcurement");
  });

  it("legacy no-snapshot fallback remains supported", () => {
    expect(read(AGREEMENT_PATCH)).toContain("Pre-migration-176 agreements have no snapshot");
  });

  it("sent/signed agreements are frozen: commercial fields stripped, no recompute", () => {
    const src = read(AGREEMENT_PATCH);
    expect(src).toContain("EDITABLE_STATUSES");
    expect(src).toContain('new Set(["draft", "generated"])');
    expect(src).toContain("isFrozen");
    expect(src).toContain("COMMERCIAL_FIELDS");
    expect(src).toContain("delete updates[field]");
    // The recompute is gated behind the not-frozen branch.
    expect(src).toContain("} else if (current?.agreement_type !== \"location_placement\") {");
  });
});

/* ------------------------------------------------------------------ */
/*  Source guards — canonical calculator + resync wired in            */
/* ------------------------------------------------------------------ */

describe("Phase 5C-a4 — affected routes wire in the canonical calculator", () => {
  it("coffee mirror uses computeLineTotal and resyncOrderTotals", () => {
    const src = read(COFFEE_MIRROR);
    expect(src).toContain("computeLineTotal");
    expect(src).toContain("resyncOrderTotals");
  });

  it("request-location uses computeLineTotal for the deposit line", () => {
    expect(read(REQUEST_LOCATION)).toContain("computeLineTotal");
  });

  it("deals finalize + PATCH call computeLineTotal and resyncOrderTotals", () => {
    for (const rel of [DEALS_FINALIZE, DEALS_PATCH]) {
      const src = read(rel);
      expect(src, rel).toContain("computeLineTotal");
      expect(src, rel).toContain("resyncOrderTotals");
    }
  });
});
