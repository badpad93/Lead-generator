import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Commission ledger tests cover the critical financial rules:
 *   - Order creation writes one pending row per line with the
 *     resolver snapshot verbatim and an idempotency key.
 *   - Settlement transitions pending -> payable and does NOT
 *     re-transition rows already payable/paid/reversed.
 *   - Full refund proportionally reverses the original AND marks
 *     the pre-payout original 'reversed' so it stops the pipeline.
 *   - Partial refund reverses proportionally.
 *   - Adjustment writes a signed row with a deterministic key.
 *   - Payout lifecycle payable -> scheduled -> paid.
 */

interface Row {
  [k: string]: unknown;
  id: string;
}
interface Table {
  rows: Row[];
  lastInsert?: Row | Row[];
}
const tables: Record<string, Table> = {};
let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}
function withId(prefix: string, base: Row): Row {
  // Base rows may or may not carry a client-supplied id; only mint
  // one when they don't (matches Postgres DEFAULT gen_random_uuid()).
  return base.id ? base : { ...base, id: nextId(prefix) };
}

function makeChain(table: string) {
  const t = (tables[table] ??= { rows: [] });
  const state = {
    filter: [...t.rows],
    isInsert: false,
    isUpsert: false,
    isUpdate: false,
    insertPayload: null as Row | Row[] | null,
    updatePayload: null as Row | null,
    updateFilters: [] as Array<{ col: string; val?: unknown; isNull?: boolean; inList?: unknown[] }>,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api: Record<string, any> = {};
  api.select = () => api;
  api.eq = (col: string, val: unknown) => {
    if (state.isUpdate) state.updateFilters.push({ col, val });
    else state.filter = state.filter.filter((r) => r[col] === val);
    return api;
  };
  api.is = (col: string, val: unknown) => {
    if (state.isUpdate) state.updateFilters.push({ col, val, isNull: val === null });
    else state.filter = state.filter.filter((r) => (val === null ? r[col] == null : r[col] === val));
    return api;
  };
  api.in = (col: string, vals: unknown[]) => {
    if (state.isUpdate) state.updateFilters.push({ col, inList: vals });
    else state.filter = state.filter.filter((r) => vals.includes(r[col]));
    return api;
  };
  api.maybeSingle = async () =>
    state.filter.length > 0 ? { data: state.filter[0], error: null } : { data: null, error: null };
  api.single = async () => {
    if (state.isInsert || state.isUpsert) {
      const p = Array.isArray(state.insertPayload) ? state.insertPayload[0] : state.insertPayload!;
      const row = withId(table, p);
      // For upsert, replace an existing row with the same idempotency_key.
      if (state.isUpsert && p && (p as Row).idempotency_key) {
        const existing = t.rows.findIndex(
          (r) => r.idempotency_key === (p as Row).idempotency_key,
        );
        if (existing !== -1) {
          t.rows[existing] = { ...t.rows[existing], ...p };
          return { data: t.rows[existing], error: null };
        }
      }
      t.rows.push(row);
      return { data: row, error: null };
    }
    return { data: null, error: null };
  };
  api.insert = (payload: unknown) => {
    state.isInsert = true;
    state.insertPayload = payload as Row | Row[];
    if (Array.isArray(payload)) {
      for (const r of payload) t.rows.push(withId(table, r as Row));
    } else {
      t.rows.push(withId(table, payload as Row));
    }
    return api;
  };
  api.upsert = (payload: unknown) => {
    state.isUpsert = true;
    state.insertPayload = payload as Row | Row[];
    const arr = Array.isArray(payload) ? payload : [payload];
    for (const r of arr) {
      const rr = r as Row;
      if (rr.idempotency_key) {
        const existing = t.rows.findIndex((row) => row.idempotency_key === rr.idempotency_key);
        if (existing !== -1) {
          t.rows[existing] = { ...t.rows[existing], ...rr };
          continue;
        }
      }
      t.rows.push(withId(table, rr));
    }
    return api;
  };
  api.update = (payload: Row) => {
    state.isUpdate = true;
    state.updatePayload = payload;
    return api;
  };
  api.then = async (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) => {
    if (state.isUpdate && state.updatePayload) {
      let matched = t.rows;
      for (const f of state.updateFilters) {
        if (f.inList) {
          matched = matched.filter((r) => f.inList!.includes(r[f.col]));
        } else if (f.isNull) {
          matched = matched.filter((r) => r[f.col] == null);
        } else {
          matched = matched.filter((r) => r[f.col] === f.val);
        }
      }
      const updated = matched.map((r) => Object.assign(r, state.updatePayload));
      return onFulfilled({ data: updated, error: null });
    }
    if (state.isInsert || state.isUpsert) {
      const arr = Array.isArray(state.insertPayload) ? state.insertPayload : [state.insertPayload];
      return onFulfilled({ data: arr as unknown[], error: null });
    }
    return onFulfilled({ data: state.filter, error: null });
  };
  return api;
}

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (t: string) => makeChain(t) },
}));

import {
  recordOrderCommissions,
  settleCommissionsForPayment,
  reverseCommissionsForRefund,
  adjustCommission,
  markCommissionsScheduled,
  markCommissionsPaid,
} from "./commissions";
import type { CommissionCart } from "./commissions";

const TENANT = "tenant-1";
const CUSTOMER = "customer-1";
const ORDER = "order-1";
const ITEM_A = "item-A";
const ITEM_B = "item-B";

function fakeResolved(): CommissionCart {
  return {
    lines: [
      {
        quantity: 2,
        base_price_amount: 80,
        tenant_price_amount: 100,
        commission_amount: 20,
      },
      {
        quantity: 1,
        base_price_amount: 50,
        tenant_price_amount: 55,
        commission_amount: 5,
      },
    ],
  };
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.storefront_commission_ledger = { rows: [] };
  tables.storefront_audit_events = { rows: [] };
  idCounter = 0;
});

describe("recordOrderCommissions", () => {
  it("writes one pending row per line with idempotency key", async () => {
    const rows = await recordOrderCommissions({
      orderId: ORDER,
      tenantId: TENANT,
      customerProfileId: CUSTOMER,
      resolved: fakeResolved(),
      orderItemIds: [ITEM_A, ITEM_B],
    });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.status).toBe("pending");
      expect(r.tenant_id).toBe(TENANT);
    }
    const keys = rows.map((r) => r.idempotency_key).sort();
    expect(keys).toEqual([`create:${ORDER}:${ITEM_A}`, `create:${ORDER}:${ITEM_B}`].sort());
    expect(tables.storefront_audit_events.rows.at(-1)?.action).toBe("commission.recorded");
  });

  it("throws when orderItemIds length != resolved.lines length", async () => {
    await expect(
      recordOrderCommissions({
        orderId: ORDER,
        tenantId: TENANT,
        customerProfileId: CUSTOMER,
        resolved: fakeResolved(),
        orderItemIds: [ITEM_A],
      }),
    ).rejects.toThrow(/does not match/);
  });
});

describe("settleCommissionsForPayment", () => {
  it("flips only pending rows to payable", async () => {
    await recordOrderCommissions({
      orderId: ORDER,
      tenantId: TENANT,
      customerProfileId: CUSTOMER,
      resolved: fakeResolved(),
      orderItemIds: [ITEM_A, ITEM_B],
    });
    const updated = await settleCommissionsForPayment({
      orderId: ORDER,
      paymentId: "pay-123",
      settledPaymentRefId: "ref-999",
    });
    expect(updated.length).toBe(2);
    const stored = tables.storefront_commission_ledger.rows;
    expect(stored.every((r) => r.status === "payable")).toBe(true);
    expect(stored[0].qb_payment_id).toBe("pay-123");
    expect(stored[0].settled_payment_ref_id).toBe("ref-999");

    // Replay -> nothing left in 'pending' to update
    const replay = await settleCommissionsForPayment({ orderId: ORDER, paymentId: "pay-123" });
    expect(replay.length).toBe(0);
  });
});

describe("reverseCommissionsForRefund", () => {
  it("full refund creates a negative-amount reversal AND marks original reversed", async () => {
    await recordOrderCommissions({
      orderId: ORDER,
      tenantId: TENANT,
      customerProfileId: CUSTOMER,
      resolved: fakeResolved(),
      orderItemIds: [ITEM_A, ITEM_B],
    });
    await settleCommissionsForPayment({ orderId: ORDER, paymentId: "pay-1" });
    const rev = await reverseCommissionsForRefund({
      orderId: ORDER,
      refundId: "refund-1",
      reason: "Customer complaint",
      lines: [
        { coffeeOrderItemId: ITEM_A, refundQuantity: 2 },
        { coffeeOrderItemId: ITEM_B, refundQuantity: 1 },
      ],
    });
    expect(rev).toHaveLength(2);
    const first = rev[0];
    expect(first.commission_amount).toBeLessThan(0);
    expect(first.reversed_of_id).toBeTruthy();
    expect(first.reversal_reason).toBe("Customer complaint");
    // Original rows (positive side) now marked 'reversed' because they were payable, not paid.
    const originals = tables.storefront_commission_ledger.rows.filter(
      (r) => r.reversed_of_id == null,
    );
    expect(originals.every((r) => r.status === "reversed")).toBe(true);
  });

  it("partial refund reverses proportionally and leaves original active", async () => {
    await recordOrderCommissions({
      orderId: ORDER,
      tenantId: TENANT,
      customerProfileId: CUSTOMER,
      resolved: fakeResolved(),
      orderItemIds: [ITEM_A, ITEM_B],
    });
    await settleCommissionsForPayment({ orderId: ORDER, paymentId: "pay-1" });
    const rev = await reverseCommissionsForRefund({
      orderId: ORDER,
      refundId: "refund-partial",
      reason: "1 of 2 damaged",
      lines: [{ coffeeOrderItemId: ITEM_A, refundQuantity: 1 }],
    });
    expect(rev).toHaveLength(1);
    // Half of $20 commission = -$10
    expect(rev[0].commission_amount).toBe(-10);
    // Original A row (qty 2) stays in place — status still payable.
    const origA = tables.storefront_commission_ledger.rows.find(
      (r) => r.coffee_order_item_id === ITEM_A && r.reversed_of_id == null,
    );
    expect(origA?.status).toBe("payable");
  });

  it("refund webhook replay is a no-op via idempotency_key", async () => {
    await recordOrderCommissions({
      orderId: ORDER,
      tenantId: TENANT,
      customerProfileId: CUSTOMER,
      resolved: fakeResolved(),
      orderItemIds: [ITEM_A, ITEM_B],
    });
    await settleCommissionsForPayment({ orderId: ORDER, paymentId: "pay-1" });
    await reverseCommissionsForRefund({
      orderId: ORDER,
      refundId: "dupe",
      reason: "x",
      lines: [{ coffeeOrderItemId: ITEM_A, refundQuantity: 2 }],
    });
    const countAfterFirst = tables.storefront_commission_ledger.rows.length;
    await reverseCommissionsForRefund({
      orderId: ORDER,
      refundId: "dupe",
      reason: "x",
      lines: [{ coffeeOrderItemId: ITEM_A, refundQuantity: 2 }],
    });
    expect(tables.storefront_commission_ledger.rows.length).toBe(countAfterFirst);
  });
});

describe("adjustCommission", () => {
  it("writes a signed adjustment row with a deterministic key", async () => {
    await recordOrderCommissions({
      orderId: ORDER,
      tenantId: TENANT,
      customerProfileId: CUSTOMER,
      resolved: fakeResolved(),
      orderItemIds: [ITEM_A, ITEM_B],
    });
    const row = await adjustCommission({
      orderId: ORDER,
      coffeeOrderItemId: ITEM_A,
      adjustmentAmount: 3.5,
      reason: "goodwill",
      actorId: "admin-1",
    });
    expect(row.commission_amount).toBe(3.5);
    expect(row.reversal_reason).toBe("goodwill");
    expect(row.idempotency_key).toMatch(/^adjust:admin-1:item-A:/);
    expect(tables.storefront_audit_events.rows.at(-1)?.action).toBe("commission.adjusted");
  });
});

describe("payout lifecycle", () => {
  it("payable -> scheduled -> paid", async () => {
    await recordOrderCommissions({
      orderId: ORDER,
      tenantId: TENANT,
      customerProfileId: CUSTOMER,
      resolved: fakeResolved(),
      orderItemIds: [ITEM_A, ITEM_B],
    });
    await settleCommissionsForPayment({ orderId: ORDER, paymentId: "pay-1" });
    const ids = tables.storefront_commission_ledger.rows.map((r) => r.id);
    await markCommissionsScheduled({ rowIds: ids, qbBillId: "bill-1", tenantId: TENANT });
    expect(tables.storefront_commission_ledger.rows.every((r) => r.status === "scheduled")).toBe(
      true,
    );
    await markCommissionsPaid({
      rowIds: ids,
      qbBillPaymentId: "billpay-1",
      tenantId: TENANT,
    });
    expect(tables.storefront_commission_ledger.rows.every((r) => r.status === "paid")).toBe(true);
    expect(tables.storefront_audit_events.rows.map((r) => r.action)).toContain("payout.sent");
  });
});
