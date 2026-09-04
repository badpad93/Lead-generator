import { describe, it, expect } from "vitest";
import { buildOrderItemsFromAgreement } from "./toOrder";
import { agreementTotals, buildLineItemsSnapshot, sumLines } from "@/lib/pricing/lineItems";

describe("agreement -> order", () => {
  const orderItems = [
    { item_type: "machine_sale", service_name: "VendEra AI Cooler", quantity: 10, unit_price: 3700, total_price: 37000 },
    { item_type: "coffee", service_name: "Flavia C600 Brewer", quantity: 1, unit_price: 450, discount_percent: 20, total_price: 360 },
    { item_type: "financing", service_name: "10/10/10 Financing", quantity: 1, unit_price: 250, total_price: 250 },
    { item_type: "location_services", service_name: "Location Services", quantity: 9, unit_price: 400, total_price: 3600 },
    { item_type: "shipping", service_name: "Freight", quantity: 1, unit_price: 5099.99, total_price: 5099.99 },
  ];

  it("round-trips every line, including the ones the old code dropped", () => {
    // The previous implementation rebuilt only machine / location /
    // freight lines from scalar columns, so a round trip through an
    // agreement permanently deleted the coffee and financing lines.
    const snapshot = buildLineItemsSnapshot(orderItems);
    const rebuilt = buildOrderItemsFromAgreement({ line_items_snapshot: snapshot });

    expect(rebuilt).toHaveLength(5);
    expect(rebuilt.map((i) => i.service_name)).toEqual(orderItems.map((i) => i.service_name));
  });

  it("round-trips the money to the cent", () => {
    const snapshot = buildLineItemsSnapshot(orderItems);
    const rebuilt = buildOrderItemsFromAgreement({ line_items_snapshot: snapshot });
    expect(sumLines(rebuilt)).toBe(sumLines(orderItems));
    expect(sumLines(rebuilt)).toBe(agreementTotals(snapshot).totalDuePriorToProcurement);
  });

  it("keeps discounts instead of flattening them to zero", () => {
    const snapshot = buildLineItemsSnapshot(orderItems);
    const rebuilt = buildOrderItemsFromAgreement({ line_items_snapshot: snapshot });
    const brewer = rebuilt.find((i) => i.service_name === "Flavia C600 Brewer");
    expect(brewer?.discount_percent).toBe(20);
    expect(brewer?.total_price).toBe(360);
  });

  it("carries the deferred flag across as a fulfillment-pending line", () => {
    const snapshot = buildLineItemsSnapshot([
      { item_type: "location_services", service_name: "Remaining balance", quantity: 1, unit_price: 800, total_price: 800, status: "pending_fulfillment" },
    ]);
    const rebuilt = buildOrderItemsFromAgreement({ line_items_snapshot: snapshot });
    expect(rebuilt[0].status).toBe("pending_fulfillment");
  });

  it("still rebuilds pre-snapshot agreements from their scalar columns", () => {
    const rebuilt = buildOrderItemsFromAgreement({
      line_items_snapshot: null,
      include_equipment: true,
      machine_quantity: 2,
      machine_unit_price: 3700,
      machine_model: "VendEra AI Machine",
      include_location_services: true,
      locations_purchased: 3,
      location_fee_per_secured: 600,
      include_shipping_storage: true,
      freight_total: 700,
      freight_per_machine: 350,
    });
    expect(rebuilt).toHaveLength(3);
    expect(sumLines(rebuilt)).toBe(7400 + 1800 + 700);
  });

  it("returns nothing for an agreement with no snapshot and no scalars", () => {
    expect(buildOrderItemsFromAgreement({ line_items_snapshot: null })).toEqual([]);
  });
});
