import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deriveFlowState } from "@/lib/salesOrderNextAction";
import {
  buildLineItemsSnapshot,
  agreementTotals,
  orderTotals,
  type LineItemLike,
} from "@/lib/pricing/lineItems";

/*
 * Order #108 regression — a commercial order (document_type='order') was
 * created and immediately invoiced via /send, which lands at invoice_sent
 * and NEVER creates an agreement (the agreement is only built on the
 * process_order -> /process step, reachable from quote_sent). Result:
 * invoice sent, no purchase_agreements row. This locks in that a
 * contract-bearing order routes through the agreement flow instead, that
 * /send persists invoice_status consistently, and that the #108 line set
 * produces the correct agreement total (46,099.99).
 *
 * No DB/HTTP in this env: flow-state + snapshot arithmetic are asserted
 * directly; the route/page wiring is asserted as source-level guards.
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

const ORDER_PAGE = "src/app/sales/orders/[id]/page.tsx";
const NEW_ORDER_PAGE = "src/app/sales/orders/new/page.tsx";
const SEND_ROUTE = "src/app/api/sales/orders/[id]/send/route.ts";
const PROCESS_ROUTE = "src/app/api/sales/orders/[id]/process/route.ts";
const SYNC = "src/lib/agreements/sync.ts";

const withItems = [{ item_type: "machine_sale" }];

describe("Order #108 — contract order routes into the agreement flow", () => {
  it("a draft ORDER with items offers Process Order & Send Agreement (not a bare invoice send)", () => {
    const state = deriveFlowState({
      document_type: "order",
      order_status: "draft",
      order_items: withItems,
    });
    expect(state.action?.verb).toBe("process_order");
    expect(state.action?.buttonLabel).toBe("Process Order & Send Agreement");
  });

  it("a draft QUOTE still sends as a quote for acceptance", () => {
    const state = deriveFlowState({
      document_type: "quote",
      order_status: "draft",
      order_items: withItems,
    });
    expect(state.action?.verb).toBe("send_quote");
  });

  it("an empty draft still asks only for line items", () => {
    const state = deriveFlowState({
      document_type: "order",
      order_status: "draft",
      order_items: [],
    });
    expect(state.action).toBeNull();
  });

  it("once the agreement is out there is no duplicate action (idempotent)", () => {
    const state = deriveFlowState({
      document_type: "order",
      order_status: "awaiting_signature",
      agreement_status: "sent",
      order_items: withItems,
    });
    expect(state.action).toBeNull();
  });
});

describe("Order #108 — route/page wiring", () => {
  it("the order detail dispatcher maps process_order -> /process and send_quote -> /send", () => {
    const src = read(ORDER_PAGE);
    expect(src).toContain('action.verb === "send_quote"');
    expect(src).toContain("/send");
    expect(src).toContain("/process");
  });

  it("the new-order page sends a contract order through /process, a quote through /send", () => {
    const src = read(NEW_ORDER_PAGE);
    expect(src).toContain('documentType === "order" ? "process" : "send"');
  });

  it("/process creates the agreement idempotently and only sends it once", () => {
    const src = read(PROCESS_ROUTE);
    expect(src).toContain("upsertAgreementForOrder");
    // guard that prevents re-sending an already-out agreement on retry
    expect(src).toContain("AGREEMENT_ALREADY_OUT");
  });

  it("/send persists invoice_status alongside order_status when a QB invoice exists", () => {
    const src = read(SEND_ROUTE);
    expect(src).toContain("statusUpdate.invoice_status = \"sent\"");
    expect(src).toContain("if (qbInvoiceId)");
  });
});

describe("Order #108 — recipient fallback (recipient_email NULL, account email present)", () => {
  it("the agreement operator_email falls back to the account email", () => {
    // sync.ts: operator_email: text(a.email, order.recipient_email)
    expect(read(SYNC)).toContain("operator_email: text(a.email, order.recipient_email)");
  });

  it("/send resolves recipient as order.recipient_email || account.email", () => {
    expect(read(SEND_ROUTE)).toContain("order.recipient_email || account?.email");
  });
});

describe("Order #108 — agreement snapshot matches the order and totals to $46,099.99", () => {
  // 10× VendEra AI Cooler @3700, 10× Location Services 10/10/10 @400,
  // Vending Machine Freight 5000, Flavia C600 Brewer $0, Coffee Machine
  // Freight 99.99, 10/10/10 Financing $0.
  const items: LineItemLike[] = [
    { item_type: "vendera_ai_cooler", service_name: "VendEra AI Cooler", quantity: 10, unit_price: 3700, total_price: 37000 },
    { item_type: "location_services", service_name: "Location Services 10/10/10", quantity: 10, unit_price: 400, total_price: 4000 },
    { item_type: "freight", service_name: "Vending Machine Freight", quantity: 1, unit_price: 5000, total_price: 5000 },
    { item_type: "coffee_program", service_name: "Flavia C600 Brewer", quantity: 1, unit_price: 0, total_price: 0 },
    { item_type: "coffee_program", service_name: "Coffee Machine Freight", quantity: 1, unit_price: 99.99, total_price: 99.99 },
    { item_type: "financing", service_name: "10/10/10 Financing", quantity: 1, unit_price: 0, total_price: 0 },
  ];

  it("agreement total equals the order upfront total and equals 46,099.99", () => {
    const snapshot = buildLineItemsSnapshot(items);
    const agreementTotal = agreementTotals(snapshot).totalDuePriorToProcurement;
    expect(agreementTotal).toBe(46099.99);
    expect(agreementTotal).toBe(orderTotals(items).upfrontTotal);
  });

  it("every order line is carried into the snapshot", () => {
    const snapshot = buildLineItemsSnapshot(items);
    expect(snapshot).toHaveLength(items.length);
  });
});
