import { describe, it, expect, beforeAll } from "vitest";
import { buildLineItemsSnapshot, agreementTotals } from "@/lib/pricing/lineItems";

type Invoicing = typeof import("./agreementInvoicing");
let invoicing: Invoicing;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "placeholder";
  invoicing = await import("./agreementInvoicing");
});

describe("invoice for a signed agreement", () => {
  const snapshot = buildLineItemsSnapshot([
    { item_type: "machine_sale", service_name: "VendEra AI Cooler", quantity: 10, unit_price: 3700, total_price: 37000 },
    { item_type: "coffee", service_name: "Flavia C600 Brewer", quantity: 2, unit_price: 1250, discount_percent: 20, total_price: 2000 },
    { item_type: "financing", service_name: "10/10/10 Financing", quantity: 1, unit_price: 250, total_price: 250 },
    { item_type: "location_services", service_name: "Remaining Balance", quantity: 1, unit_price: 800, total_price: 800, status: "pending_fulfillment" },
  ]);

  it("bills every line the customer signed for", () => {
    // It used to rebuild the invoice from the scalar columns, so the
    // brewer and the financing line were never billed at all.
    const items = invoicing.buildAgreementLineItems({ line_items_snapshot: snapshot });
    expect(items.map((i) => i.service_name)).toEqual([
      "VendEra AI Cooler",
      "Flavia C600 Brewer",
      "10/10/10 Financing",
      "Remaining Balance",
    ]);
  });

  it("bills the same total the contract shows", () => {
    const items = invoicing.buildAgreementLineItems({ line_items_snapshot: snapshot });
    const upfront = items.filter((i) => i.status !== "pending_fulfillment");
    const billed = upfront.reduce((sum, i) => sum + i.total_price, 0);
    expect(billed).toBe(agreementTotals(snapshot).totalDuePriorToProcurement);
  });

  it("charges the discounted rate per unit, not list", () => {
    // QuickBooks multiplies quantity by amount, so passing the list
    // unit price would have billed $2,500 for a $2,000 line.
    const items = invoicing.buildAgreementLineItems({ line_items_snapshot: snapshot });
    const brewer = items.find((i) => i.service_name === "Flavia C600 Brewer")!;
    expect(invoicing.billableUnitAmount(brewer)).toBe(1000);
    expect(invoicing.billableUnitAmount(brewer) * brewer.quantity).toBe(brewer.total_price);
  });

  it("keeps the fulfillment balance off the upfront invoice", () => {
    const items = invoicing.buildAgreementLineItems({ line_items_snapshot: snapshot });
    const deferred = items.filter((i) => i.status === "pending_fulfillment");
    expect(deferred).toHaveLength(1);
    expect(deferred[0].total_price).toBe(800);
  });
});
