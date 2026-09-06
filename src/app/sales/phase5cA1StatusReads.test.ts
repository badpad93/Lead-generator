import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deriveFlowState } from "@/lib/salesOrderNextAction";

/*
 * Phase 5C-a1 — remove INTERNAL read dependence on the legacy
 * sales_orders.status column; make reporting/duplicate detection key off
 * the canonical order_status; fix the anomalous order_status="sent"
 * writer. Legacy `status` COMPAT WRITES are intentionally retained, and
 * next_required_action is intentionally untouched.
 *
 * No DOM/DB test env exists, so the endpoint-level assertions are
 * source-level regression guards; the flow-state logic is asserted
 * directly (pure).
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

const REPORTS = [
  "src/app/api/sales/workload/route.ts",
  "src/app/api/sales/results/route.ts",
  "src/app/api/sales/executive-snapshot/route.ts",
];
const DUPLICATES = "src/app/api/admin/sales-accounts/duplicates/route.ts";
const REQUEST_LOCATION = "src/app/api/request-location/route.ts";
const CREATE_ORDER = "src/app/api/sales/orders/route.ts";

describe("Phase 5C-a1 — canonical replacement state is recognized", () => {
  it("deriveFlowState treats invoice_sent as awaiting payment (no competing CTA)", () => {
    const s = deriveFlowState({
      document_type: "order",
      order_status: "invoice_sent",
      order_items: [{ item_type: "location_services" }],
    });
    expect(s.stage).toBe("awaiting_payment");
    expect(s.action).toBeFalsy();
  });

  it('"sent" is NOT a recognized canonical order_status (falls through)', () => {
    const s = deriveFlowState({
      document_type: "order",
      order_status: "sent",
      order_items: [{ item_type: "location_services" }],
    });
    // it must not resolve to the awaiting_payment stage invoice_sent gives
    expect(s.stage).not.toBe("awaiting_payment");
  });
});

describe("Phase 5C-a1 — reporting no longer reads legacy sales_orders.status", () => {
  it("the three closed/won reports use order_status, not status.eq.completed", () => {
    for (const rel of REPORTS) {
      const src = read(rel);
      expect(src, rel).not.toContain("status.eq.completed,order_status");
      expect(src, rel).not.toContain(",status.eq.completed");
      // canonical won-set present
      expect(src, rel).toContain("order_status.eq.paid,order_status.eq.completed");
    }
  });

  it("admin duplicate detection uses order_status, not r.status", () => {
    const src = read(DUPLICATES);
    expect(src).not.toContain('r.status === "completed"');
    expect(src).not.toContain(", status, order_status"); // dropped from select
    expect(src).toContain('r.order_status === "paid"');
    expect(src).toContain('r.order_status === "completed"');
  });
});

describe("Phase 5C-a1 — request-location anomaly fixed", () => {
  it("no longer writes order_status = 'sent'", () => {
    expect(read(REQUEST_LOCATION)).not.toContain('order_status: "sent"');
  });
  it("writes the canonical order_status = 'invoice_sent'", () => {
    expect(read(REQUEST_LOCATION)).toContain('order_status: "invoice_sent"');
  });
  it("no source writes order_status = 'sent' anywhere", () => {
    for (const rel of [REQUEST_LOCATION, CREATE_ORDER, ...REPORTS]) {
      expect(read(rel), rel).not.toContain('order_status: "sent"');
    }
  });
});

describe("Phase 5C-a1 — legacy compatibility preserved", () => {
  it("legacy status compat writes are retained (not removed this phase)", () => {
    expect(read(CREATE_ORDER)).toContain('status: "draft"');
    expect(read(REQUEST_LOCATION)).toContain('status: "sent"');
  });
  it("next_required_action is still written (untouched this phase)", () => {
    expect(read(REQUEST_LOCATION)).toContain("next_required_action");
    expect(read(CREATE_ORDER)).toContain("next_required_action");
  });
});
