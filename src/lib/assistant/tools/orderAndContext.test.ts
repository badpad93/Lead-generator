import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseStub, type StubStore } from "../__testutils__/supabaseStub";

const store: StubStore = {};
const stub = createSupabaseStub(store);
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));

import { runGetOrderStatus } from "./getOrderStatus";
import { runGetCustomerContext, classifyRole } from "./getCustomerContext";
import { findProhibitedKey } from "../publicShapes";
import type { ToolContext } from "./context";

const ME: ToolContext = { threadId: "t", profile: { id: "ME", full_name: "Jamie Q Public", role: "operator", coffee_access_enabled: true, storefront_tenant_id: null }, storefront: null };
const OTHER: ToolContext = { threadId: "t", profile: { id: "OTHER", full_name: "Someone Else", role: "customer", coffee_access_enabled: false, storefront_tenant_id: "TEN" }, storefront: { tenantId: "TEN", customerProfileId: "OTHER", display_name: "Twelve28 Coffee", slug: "twelve28" } };
const GUEST: ToolContext = { threadId: "t", profile: null, storefront: null };

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  stub.accessed.clear();
  store.coffee_orders = [
    { id: "0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11", operator_id: "ME", order_number: "VC-100", status: "shipped", created_at: "2026-09-01T00:00:00Z", total: 120.5, tracking_number: "VC-ABCD1234", qb_invoice_id: "QB-9", base_price_total: 80, commission_total: 40, shipping_address: "1 Main St" },
    { id: "1d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a22", operator_id: "OTHER", order_number: "VC-200", status: "pending", created_at: "2026-09-02T00:00:00Z", total: 50, tracking_number: null },
  ];
  store.coffee_order_items = [{ order_id: "0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11", product_name: "Lavazza Classico", quantity: 2, base_price_per_unit: 30, commission_per_unit: 5 }];
  store.workflows = [{ id: "2d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a33", customer_id: "ME", workflow_number: "WF-000007", title: "Machine fulfillment", overall_status: "in_progress", payment_status: "paid", created_at: "2026-08-01T00:00:00Z", quantity_purchased: 2, product_name: "AI Cooler" }];
  store.workflow_stages = [
    { workflow_id: "2d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a33", stage_name: "Payment confirmed", status: "completed", stage_order: 1, customer_visible: true, internal_notes: "secret" },
    { workflow_id: "2d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a33", stage_name: "Internal QA", status: "in_progress", stage_order: 2, customer_visible: false },
    { workflow_id: "2d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a33", stage_name: "Shipped", status: "in_progress", stage_order: 3, customer_visible: true },
  ];
  store.storefront_quotes = [{ id: "3d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a44", customer_profile_id: "OTHER", status: "sent", created_at: "2026-09-03T00:00:00Z", total: 300, expires_at: null, est_cost: 200, est_gross_profit: 100 }];
  store.storefront_quote_lines = [{ quote_id: "3d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a44", product_name: "Blend", quantity: 4, unit_cost: 10 }];
  store.sales_orders = [{ id: "4d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a55", recipient_email: "jamie@example.com", order_number: 77, order_status: "paid" }];
});

describe("get_order_status — trusted user-id relationships only", () => {
  it("finds the caller's own coffee order by number and by id with an allowlisted shape", async () => {
    const byNumber = await runGetOrderStatus({ order_id: null, order_number: "VC-100" }, ME);
    expect(byNumber.status).toBe("found");
    expect(byNumber.record?.reference).toBe("VC-100");
    expect(byNumber.record?.tracking_number).toBe("VC-ABCD1234");
    expect(byNumber.record?.payment_status).toBe("paid");
    expect(byNumber.record?.items).toEqual([{ name: "Lavazza Classico", quantity: 2 }]);
    expect(findProhibitedKey(byNumber)).toBeNull();
    for (const bad of ["QB-9", "base_price", "commission", "1 Main St"]) expect(JSON.stringify(byNumber)).not.toContain(bad);
    const byId = await runGetOrderStatus({ order_id: "0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11", order_number: null }, ME);
    expect(byId.status).toBe("found");
  });

  it("returns not_found for another user's order, identically to a nonexistent order", async () => {
    const other = await runGetOrderStatus({ order_id: null, order_number: "VC-200" }, ME);
    const missing = await runGetOrderStatus({ order_id: null, order_number: "VC-999" }, ME);
    expect(other).toEqual({ status: "not_found" });
    expect(missing).toEqual({ status: "not_found" });
    expect(other).toEqual(missing);
  });

  it("never consults sales_orders or matches by recipient email", async () => {
    await runGetOrderStatus({ order_id: "4d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a55", order_number: null }, ME);
    await runGetOrderStatus({ order_id: null, order_number: "77" }, ME);
    expect(stub.accessed.has("sales_orders")).toBe(false);
  });

  it("returns only customer-visible workflow stages", async () => {
    const wf = await runGetOrderStatus({ order_id: null, order_number: "WF-000007" }, ME);
    expect(wf.status).toBe("found");
    expect(wf.record?.stages.map((s) => s.label)).toEqual(["Payment confirmed", "Shipped"]);
    expect(wf.record?.workflow_stage).toBe("Shipped");
    expect(JSON.stringify(wf)).not.toContain("Internal QA");
    expect(JSON.stringify(wf)).not.toContain("secret");
  });

  it("shows a storefront customer their own quote without internal economics", async () => {
    const q = await runGetOrderStatus({ order_id: "3d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a44", order_number: null }, OTHER);
    expect(q.status).toBe("found");
    expect(q.record?.record_type).toBe("storefront_quote");
    expect(JSON.stringify(q)).not.toMatch(/est_cost|gross_profit|unit_cost/);
    const notMine = await runGetOrderStatus({ order_id: "3d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a44", order_number: null }, ME);
    expect(notMine).toEqual({ status: "not_found" });
  });

  it("requires authentication", async () => {
    expect(await runGetOrderStatus({ order_id: null, order_number: "VC-100" }, GUEST)).toEqual({ status: "authentication_required" });
  });
});

describe("get_customer_context — self only", () => {
  it("returns authenticated:false for guests", async () => {
    expect(await runGetCustomerContext(GUEST)).toEqual({ authenticated: false });
  });

  it("returns only the caller's first name, role class, storefront label, and own-record counts", async () => {
    const ctx = await runGetCustomerContext(ME);
    expect(ctx).toEqual({
      authenticated: true,
      first_name: "Jamie",
      role_class: "operator",
      coffee_access: true,
      storefront: null,
      counts: { coffee_orders: 1, workflows: 1, storefront_quotes: 0 },
    });
    const other = await runGetCustomerContext(OTHER);
    expect(other.counts).toEqual({ coffee_orders: 1, workflows: 0, storefront_quotes: 1 });
    expect(other.storefront).toEqual({ display_name: "Twelve28 Coffee", slug: "twelve28" });
    expect(findProhibitedKey(other)).toBeNull();
    expect(JSON.stringify(other)).not.toMatch(/email|phone|payout|qb_|stripe/);
  });

  it("classifies roles into safe buckets", () => {
    expect(classifyRole("admin")).toBe("staff");
    expect(classifyRole("placement_partner")).toBe("partner");
    expect(classifyRole("customer")).toBe("customer");
    expect(classifyRole(null)).toBe("member");
  });
});
