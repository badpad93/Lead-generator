import { describe, it, expect } from "vitest";
import {
  orderTotals,
  agreementTotals,
  buildLineItemsSnapshot,
  type LineItemLike,
  type SnapshotLine,
} from "./lineItems";

/*
 * Phase 5C-a2 — the integrity views in migration 188 must measure the
 * SAME invariant the canonical calculator enforces. There is no DB in
 * this environment, so instead of running the SQL we replicate each
 * view's arithmetic here and assert it equals the canonical
 * orderTotals()/agreementTotals() across the tricky cases (discounts,
 * $0 lines, multiple quantities, deferred lines, price vs unit_price,
 * and legacy/empty snapshots). If these stay in lock-step, the SQL —
 * which uses the same formula — measures the right thing.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Mirror of order_total_integrity's line_total:
 *  round(sum(total_price)) over non-'pending_fulfillment' items. */
function sqlOrderLineTotal(items: Array<{ total_price?: number; status?: string }>): number {
  return round2(
    items
      .filter((i) => (i.status ?? "") !== "pending_fulfillment")
      .reduce((s, i) => s + Number(i.total_price ?? 0), 0),
  );
}

/** Mirror of agreement_total_integrity's snapshot_total:
 *  round(sum(total_price)) over non-deferred snapshot lines. */
function sqlSnapshotTotal(snapshot: SnapshotLine[]): number {
  return round2(
    snapshot.filter((l) => !l.deferred).reduce((s, l) => s + Number(l.total_price ?? 0), 0),
  );
}

/** Mirror of agreement integrity_status classification. */
function sqlAgreementStatus(
  agreementTotal: number,
  snapshot: SnapshotLine[] | null | undefined,
): "match" | "mismatch" | "not_verifiable" {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return "not_verifiable";
  const snap = sqlSnapshotTotal(snapshot);
  return Math.abs((agreementTotal ?? 0) - snap) <= 0.01 ? "match" : "mismatch";
}

describe("order_total_integrity mirrors orderTotals().upfrontTotal", () => {
  const cases: Array<{ name: string; items: LineItemLike[] }> = [
    {
      name: "normal single line",
      items: [{ quantity: 1, unit_price: 100, total_price: 100 }],
    },
    {
      name: "discounted line (100 @ 20% -> 80)",
      items: [{ quantity: 1, unit_price: 100, discount_percent: 20, total_price: 80 }],
    },
    {
      name: "explicit $0 / comped line stays 0",
      items: [{ quantity: 1, unit_price: 100, total_price: 0 }],
    },
    {
      name: "multiple quantities",
      items: [{ quantity: 3, unit_price: 3700, total_price: 11100 }],
    },
    {
      name: "price != unit_price but total_price authoritative",
      items: [{ quantity: 2, unit_price: 100, price: 90, total_price: 200 }],
    },
    {
      name: "mixed order with a deferred (pending_fulfillment) line excluded",
      items: [
        { quantity: 2, unit_price: 3700, total_price: 7400 },
        { quantity: 3, unit_price: 500, total_price: 1500 },
        { quantity: 1, unit_price: 800, total_price: 800, status: "pending_fulfillment" },
      ],
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      // The header the view compares against is what resyncOrderTotals writes.
      const canonicalHeader = orderTotals(c.items).upfrontTotal;
      const viewLineTotal = sqlOrderLineTotal(
        c.items as Array<{ total_price?: number; status?: string }>,
      );
      expect(viewLineTotal).toBe(canonicalHeader);
      // A correctly-synced order therefore shows integrity_status = match.
      expect(Math.abs(canonicalHeader - viewLineTotal) <= 0.01).toBe(true);
    });
  }
});

describe("agreement_total_integrity mirrors agreementTotals().totalDuePriorToProcurement", () => {
  it("snapshot-backed agreement: match when total equals non-deferred snapshot sum", () => {
    const items: LineItemLike[] = [
      { item_type: "machine_sale", service_name: "VendEra AI", quantity: 2, unit_price: 3700, total_price: 7400 },
      { item_type: "location_services", service_name: "Location Services", quantity: 3, unit_price: 500, total_price: 1500 },
      { item_type: "coffee_program", service_name: "Coffee", quantity: 1, unit_price: 300, discount_percent: 10, total_price: 270 },
    ];
    const snapshot = buildLineItemsSnapshot(items);
    const canonicalTotal = agreementTotals(snapshot).totalDuePriorToProcurement;
    expect(sqlSnapshotTotal(snapshot)).toBe(canonicalTotal);
    expect(sqlAgreementStatus(canonicalTotal, snapshot)).toBe("match");
  });

  it("deferred snapshot line is excluded from the checked total", () => {
    const items: LineItemLike[] = [
      { item_type: "location_services", service_name: "Location Services", quantity: 3, unit_price: 500, total_price: 1500 },
      { item_type: "location_services", service_name: "Location Services Remaining Balance", quantity: 1, unit_price: 800, total_price: 800, status: "pending_fulfillment" },
    ];
    const snapshot = buildLineItemsSnapshot(items);
    const canonicalTotal = agreementTotals(snapshot).totalDuePriorToProcurement;
    expect(sqlSnapshotTotal(snapshot)).toBe(canonicalTotal); // 1500, not 2300
    expect(canonicalTotal).toBe(1500);
  });

  it("a drifted header is classified mismatch", () => {
    const snapshot = buildLineItemsSnapshot([
      { item_type: "machine_sale", service_name: "VendEra AI", quantity: 1, unit_price: 3700, total_price: 3700 },
    ]);
    expect(sqlAgreementStatus(9999, snapshot)).toBe("mismatch");
  });

  it("legacy scalar-only agreement (no snapshot) is not_verifiable, not a false mismatch", () => {
    expect(sqlAgreementStatus(3700, null)).toBe("not_verifiable");
    expect(sqlAgreementStatus(3700, [])).toBe("not_verifiable");
  });
});
