import { describe, it, expect } from "vitest";
import { deriveFlowState, deriveNextStep, orderNeedsAgreement } from "./salesOrderNextAction";

const withItems = [{ item_type: "machine_sale" }];

describe("the sales flow", () => {
  it("asks for line items and nothing else on a new quote", () => {
    const state = deriveFlowState({ document_type: "quote", order_status: "draft", order_items: [] });
    expect(state.stage).toBe("building");
    expect(state.action).toBeNull();
    expect(state.headline).toBe("Add line items");
  });

  it("offers exactly one button once there are line items", () => {
    const state = deriveFlowState({
      document_type: "quote",
      order_status: "draft",
      order_items: withItems,
    });
    expect(state.action?.verb).toBe("send_quote");
    expect(state.action?.buttonLabel).toBe("Next");
  });

  it("offers Process Order & Send Invoice once the quote is out", () => {
    const state = deriveFlowState({
      document_type: "quote",
      order_status: "quote_sent",
      order_items: withItems,
    });
    expect(state.action?.verb).toBe("process_order");
    expect(state.action?.buttonLabel).toBe("Process Order & Send Invoice");
  });

  it("shows no button at all while waiting on the customer", () => {
    const state = deriveFlowState({
      document_type: "order",
      order_status: "awaiting_payment",
      invoice_status: "sent",
      agreement_status: "sent",
      order_items: withItems,
    });
    expect(state.stage).toBe("awaiting_payment");
    expect(state.action).toBeNull();
    expect(state.headline).toBe("Order processed, invoice sent — waiting on customer payment");
  });

  it("hands a paid order to workflows with nothing left to click", () => {
    const state = deriveFlowState({
      document_type: "order",
      order_status: "paid",
      order_items: withItems,
    });
    expect(state.stage).toBe("in_fulfillment");
    expect(state.action).toBeNull();
    expect(state.headline).toBe("Paid — sent to workflows");
  });

  it("goes quiet on terminal states", () => {
    for (const status of ["completed", "cancelled"]) {
      const state = deriveFlowState({ order_status: status, order_items: withItems });
      expect(state.stage).toBe("closed");
      expect(state.action).toBeNull();
    }
  });

  it("never offers more than one action anywhere in the flow", () => {
    const statuses = [
      "draft", "quote_sent", "order_sent", "invoice_sent", "agreement_sent",
      "awaiting_signature", "awaiting_payment", "deposit_paid", "paid",
      "machine_ordered", "shipped", "delivered", "completed", "cancelled",
    ];
    const verbs = new Set<string>();
    for (const order_status of statuses) {
      const step = deriveNextStep({ order_status, order_items: withItems });
      if (step) verbs.add(step.verb);
    }
    // Two buttons exist in the whole lifecycle. That is the point.
    expect([...verbs].sort()).toEqual(["process_order", "send_quote"]);
  });
});

describe("orderNeedsAgreement", () => {
  it("is true for every order now", () => {
    // It used to test item_type === 'coffee_program', a value the
    // storefront mirror never wrote — so real coffee orders were
    // excluded from the very gate meant to catch them.
    expect(orderNeedsAgreement({ order_items: [{ item_type: "coffee" }] })).toBe(true);
    expect(orderNeedsAgreement({ order_items: [{ item_type: "machine_sale" }] })).toBe(true);
    expect(orderNeedsAgreement({ order_items: [] })).toBe(true);
  });
});
