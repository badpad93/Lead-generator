import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tests focus on the load-bearing rule: the retry must NEVER
 * create a duplicate invoice on QBO. Everything else in this
 * module (cap, gap, status counters) is plumbing.
 *
 * Scenarios covered:
 *   1. Orphaned invoice on QBO → adopted, no create call
 *   2. No orphan → create is called (single time)
 *   3. QBO returns 6140 during create → adopted via post-error lookup
 *   4. Pre-check fails (non-timeout) → refuses to create
 *   5. Pre-check throws QbTimeoutError → refuses, marks failed_timeout
 *   6. Cap and gap gates honored under respect=true, bypassed under false
 *   7. Sweep canary QbTimeoutError → returns ping_failed, no orders touched
 *
 * We stub Supabase and the QBO helper surface. The DB is a
 * per-test in-memory record; QBO calls are recorded so tests can
 * assert on call counts (proving there's no duplicate create).
 */

// ─── Supabase mock ────────────────────────────────────────────────

interface Order {
  id: string;
  order_number: string;
  status: string;
  qb_invoice_id: string | null;
  operator_id: string;
  billing_email: string | null;
  billing_contact_name: string | null;
  invoice_retry_attempts: number;
  invoice_last_attempt_at: string | null;
  invoice_retry_failed_reason: string | null;
  created_at: string;
  payment_provider: string | null;
  subtotal: number | null;
  shipping_estimate: number | null;
  total: number | null;
}
interface OrderItem {
  order_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: number;
  shipping_cost: number | null;
}
// Hoisted so the vi.mock factory (which is itself hoisted above
// imports) can share the same object references the tests mutate.
// Without hoisting, the factory closes over a `state` that lands in
// a different eval scope from what beforeEach/seedOrder touch — the
// mock reads empty arrays no matter what tests push.
const state = vi.hoisted(() => ({
  coffee_orders: [] as Order[],
  coffee_order_items: [] as OrderItem[],
  profiles: [] as Array<{ id: string; full_name: string | null; email: string | null }>,
}));

function makeChain(table: string) {
  const s = state as unknown as Record<string, unknown[]>;
  const rows = s[table] ?? [];
  const filter = [...rows];
  let update: Record<string, unknown> | null = null;
  const eqs: Array<{ col: string; val: unknown }> = [];
  const api: {
    select: () => typeof api;
    update: (u: Record<string, unknown>) => typeof api;
    eq: (col: string, val: unknown) => typeof api;
    is: (col: string, val: unknown) => typeof api;
    lt: (col: string, val: unknown) => typeof api;
    or: (cond: string) => typeof api;
    order: () => typeof api;
    limit: () => typeof api;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
    then: (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) => Promise<unknown>;
  } = {
    select() { return api; },
    update(u) { update = u; return api; },
    eq(col, val) {
      if (update) eqs.push({ col, val });
      const before = filter.slice();
      filter.length = 0;
      for (const r of before) {
        if ((r as Record<string, unknown>)[col] === val) filter.push(r);
      }
      return api;
    },
    is(col, val) {
      const before = filter.slice();
      filter.length = 0;
      for (const r of before) {
        const rv = (r as Record<string, unknown>)[col];
        if (val === null ? rv == null : rv === val) filter.push(r);
      }
      return api;
    },
    lt(col, val) {
      const before = filter.slice();
      filter.length = 0;
      for (const r of before) {
        const rv = (r as Record<string, unknown>)[col];
        if (rv != null && (rv as string | number) < (val as string | number)) filter.push(r);
      }
      return api;
    },
    or() { return api; },
    order() { return api; },
    limit() { return api; },
    maybeSingle: async () =>
      filter.length > 0 ? { data: filter[0], error: null } : { data: null, error: null },
    then: async (onFulfilled) => {
      if (update) {
        // Apply the update to matching rows in the real backing array.
        for (const r of rows) {
          let match = true;
          for (const e of eqs) {
            if ((r as Record<string, unknown>)[e.col] !== e.val) match = false;
          }
          if (match) Object.assign(r as Record<string, unknown>, update);
        }
        return onFulfilled({ data: [], error: null });
      }
      return onFulfilled({ data: filter, error: null });
    },
  };
  return api;
}

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from(table: string) {
      return makeChain(table);
    },
  },
}));

// ─── quickbooks mock ─────────────────────────────────────────────

const qb = vi.hoisted(() => ({
  findInvoiceCallCount: 0,
  createInvoiceCallCount: 0,
  sendInvoiceEmailCallCount: 0,
  getInvoiceCallCount: 0,
  pingCallCount: 0,
  // Behaviour switches per test
  orphanForDocNumber: null as string | null,
  createResult: null as { Id: string; DocNumber: string } | null,
  createThrows: null as Error | null,
  createThrowsDuplicate6140: false,
  findThrows: null as Error | null,
  pingThrows: null as Error | null,
}));

vi.mock("@/lib/quickbooks", () => {
  class QbTimeoutError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "QbTimeoutError";
    }
  }
  return {
    QbTimeoutError,
    findInvoiceByDocNumber: async (docNumber: string) => {
      qb.findInvoiceCallCount += 1;
      if (qb.findThrows) throw qb.findThrows;
      return qb.orphanForDocNumber === docNumber
        ? { Id: `orphan-${docNumber}`, DocNumber: docNumber }
        : null;
    },
    createInvoice: async (params: { docNumber?: string }) => {
      qb.createInvoiceCallCount += 1;
      if (qb.createThrows) throw qb.createThrows;
      if (qb.createThrowsDuplicate6140) {
        return {
          Id: `recovered-${params.docNumber}`,
          DocNumber: params.docNumber ?? "",
        };
      }
      return (
        qb.createResult ?? {
          Id: `created-${params.docNumber}`,
          DocNumber: params.docNumber ?? "",
        }
      );
    },
    getInvoice: async () => {
      qb.getInvoiceCallCount += 1;
      return {
        Id: "x",
        DocNumber: "x",
        TotalAmt: 0,
        Balance: 0,
        SyncToken: "0",
        MetaData: { CreateTime: "", LastUpdatedTime: "" },
      };
    },
    sendInvoiceEmail: async () => {
      qb.sendInvoiceEmailCallCount += 1;
    },
    pingQuickBooks: async () => {
      qb.pingCallCount += 1;
      if (qb.pingThrows) throw qb.pingThrows;
    },
  };
});

// Re-import the mocked class for constructing test instances.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let QbTimeoutError: any;
async function loadTimeoutError() {
  if (!QbTimeoutError) {
    const mod = await import("@/lib/quickbooks");
    QbTimeoutError = mod.QbTimeoutError;
  }
  return QbTimeoutError;
}

import { attemptInvoiceForOrder, runInvoiceRetrySweep } from "./coffeeInvoiceRetry";

function seedOrder(overrides: Partial<Order> = {}): Order {
  const now = new Date();
  const eleven_min_ago = new Date(now.getTime() - 11 * 60 * 1000).toISOString();
  const o: Order = {
    id: overrides.id ?? "order-1",
    order_number: overrides.order_number ?? "VC-1234567890000",
    status: overrides.status ?? "awaiting_payment",
    qb_invoice_id: overrides.qb_invoice_id ?? null,
    operator_id: overrides.operator_id ?? "user-1",
    billing_email: overrides.billing_email ?? "buyer@example.com",
    billing_contact_name: overrides.billing_contact_name ?? "Buyer",
    invoice_retry_attempts: overrides.invoice_retry_attempts ?? 0,
    invoice_last_attempt_at: overrides.invoice_last_attempt_at ?? null,
    invoice_retry_failed_reason: overrides.invoice_retry_failed_reason ?? null,
    created_at: overrides.created_at ?? eleven_min_ago,
    payment_provider: overrides.payment_provider ?? "stripe",
    subtotal: overrides.subtotal ?? 10,
    shipping_estimate: overrides.shipping_estimate ?? 0,
    total: overrides.total ?? 10,
  };
  state.coffee_orders.push(o);
  state.coffee_order_items.push({
    order_id: o.id,
    product_name: "House Blend",
    product_sku: "HB-5",
    quantity: 1,
    unit_price: 10,
    shipping_cost: 0,
  });
  state.profiles.push({ id: o.operator_id, full_name: "Buyer", email: "buyer@example.com" });
  return o;
}

beforeEach(() => {
  state.coffee_orders.length = 0;
  state.coffee_order_items.length = 0;
  state.profiles.length = 0;
  qb.findInvoiceCallCount = 0;
  qb.createInvoiceCallCount = 0;
  qb.sendInvoiceEmailCallCount = 0;
  qb.getInvoiceCallCount = 0;
  qb.pingCallCount = 0;
  qb.orphanForDocNumber = null;
  qb.createResult = null;
  qb.createThrows = null;
  qb.createThrowsDuplicate6140 = false;
  qb.findThrows = null;
  qb.pingThrows = null;
});

describe("attemptInvoiceForOrder — double-invoice safety", () => {
  it("adopts an orphaned invoice found by DocNumber and never calls createInvoice", async () => {
    const o = seedOrder();
    qb.orphanForDocNumber = o.order_number;
    const res = await attemptInvoiceForOrder(o.id, { respectCap: true, respectGap: true });
    expect(res.outcome).toBe("adopted");
    if (res.outcome !== "adopted") throw new Error("unreachable");
    expect(res.qbInvoiceId).toBe(`orphan-${o.order_number}`);
    expect(qb.findInvoiceCallCount).toBe(1);
    expect(qb.createInvoiceCallCount).toBe(0);
    // The order row was updated with the adopted id
    expect(state.coffee_orders[0].qb_invoice_id).toBe(`orphan-${o.order_number}`);
    expect(state.coffee_orders[0].payment_provider).toBe("quickbooks");
  });

  it("creates a new invoice when no orphan exists", async () => {
    const o = seedOrder();
    qb.createResult = { Id: "inv-new", DocNumber: o.order_number };
    const res = await attemptInvoiceForOrder(o.id, { respectCap: true, respectGap: true });
    expect(res.outcome).toBe("created");
    expect(qb.findInvoiceCallCount).toBe(1);
    expect(qb.createInvoiceCallCount).toBe(1);
    expect(state.coffee_orders[0].qb_invoice_id).toBe("inv-new");
  });

  it("refuses to create if the pre-check throws (non-timeout) — protects against duplicate risk", async () => {
    const o = seedOrder();
    qb.findThrows = new Error("intuit returned garbage");
    const res = await attemptInvoiceForOrder(o.id, { respectCap: true, respectGap: true });
    expect(res.outcome).toBe("failed_other");
    expect(qb.createInvoiceCallCount).toBe(0);
    expect(state.coffee_orders[0].qb_invoice_id).toBeNull();
    expect(state.coffee_orders[0].invoice_retry_failed_reason).toContain("Pre-check failed");
  });

  it("refuses to create if the pre-check times out", async () => {
    const o = seedOrder();
    const T = await loadTimeoutError();
    qb.findThrows = new T("abort");
    const res = await attemptInvoiceForOrder(o.id, { respectCap: true, respectGap: true });
    expect(res.outcome).toBe("failed_timeout");
    expect(qb.createInvoiceCallCount).toBe(0);
    expect(state.coffee_orders[0].qb_invoice_id).toBeNull();
  });

  it("stamps the 6140-recovery Id from createInvoice (belt-and-suspenders)", async () => {
    const o = seedOrder();
    qb.createThrowsDuplicate6140 = true;
    const res = await attemptInvoiceForOrder(o.id, { respectCap: true, respectGap: true });
    expect(res.outcome).toBe("created");
    if (res.outcome !== "created") throw new Error("unreachable");
    expect(res.qbInvoiceId).toBe(`recovered-${o.order_number}`);
    expect(state.coffee_orders[0].qb_invoice_id).toBe(`recovered-${o.order_number}`);
  });
});

describe("attemptInvoiceForOrder — cap + gap", () => {
  it("honors the attempts cap when respectCap=true", async () => {
    const o = seedOrder({ invoice_retry_attempts: 6 });
    const res = await attemptInvoiceForOrder(o.id, { respectCap: true, respectGap: true });
    expect(res.outcome).toBe("skipped_cap");
    expect(qb.findInvoiceCallCount).toBe(0);
    expect(qb.createInvoiceCallCount).toBe(0);
  });

  it("bypasses the cap when respectCap=false (admin retry)", async () => {
    const o = seedOrder({ invoice_retry_attempts: 6 });
    qb.createResult = { Id: "inv-manual", DocNumber: o.order_number };
    const res = await attemptInvoiceForOrder(o.id, { respectCap: false, respectGap: false });
    expect(res.outcome).toBe("created");
    expect(state.coffee_orders[0].qb_invoice_id).toBe("inv-manual");
  });

  it("honors the min-gap between attempts when respectGap=true", async () => {
    const o = seedOrder({
      invoice_last_attempt_at: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    const res = await attemptInvoiceForOrder(o.id, { respectCap: true, respectGap: true });
    expect(res.outcome).toBe("skipped_recent");
    expect(qb.findInvoiceCallCount).toBe(0);
  });
});

describe("runInvoiceRetrySweep — canary short-circuit", () => {
  it("aborts the entire run when the canary times out", async () => {
    seedOrder({ id: "order-a" });
    seedOrder({ id: "order-b", order_number: "VC-222" });
    const T = await loadTimeoutError();
    qb.pingThrows = new T("abort");
    const summary = await runInvoiceRetrySweep();
    expect(summary.ping_failed).toBe(true);
    expect(summary.scanned).toBe(0);
    expect(qb.findInvoiceCallCount).toBe(0);
    expect(qb.createInvoiceCallCount).toBe(0);
    // Neither order was touched
    expect(state.coffee_orders.every((o) => o.qb_invoice_id === null)).toBe(true);
  });

  it("aborts the rest of the sweep after the first per-order timeout", async () => {
    seedOrder({ id: "order-a", order_number: "VC-a" });
    seedOrder({ id: "order-b", order_number: "VC-b" });
    seedOrder({ id: "order-c", order_number: "VC-c" });
    const T = await loadTimeoutError();
    qb.findThrows = new T("abort"); // Every find throws
    const summary = await runInvoiceRetrySweep();
    expect(summary.ping_failed).toBe(false);
    expect(summary.scanned).toBe(1);
    expect(summary.failed_timeout).toBe(1);
    // The second and third orders were never touched
    expect(qb.findInvoiceCallCount).toBe(1);
    expect(qb.createInvoiceCallCount).toBe(0);
  });
});
