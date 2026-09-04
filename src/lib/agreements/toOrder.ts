/**
 * agreement -> order.
 *
 * The other half of src/lib/agreements/sync.ts. Kept in its own file
 * because the two directions are used by different callers and the
 * combined module outgrew the 500-line limit.
 */

import { round2, type SnapshotLine } from "@/lib/pricing/lineItems";

type Row = Record<string, unknown>;

function text(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return "";
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface RebuiltOrderItem extends Record<string, unknown> {
  item_type: string;
  service_name: string;
  quantity: number;
  unit_price: number;
  price: number;
  discount_percent: number;
  total_price: number;
  status: string;
}

function itemFromSnapshotLine(line: SnapshotLine): RebuiltOrderItem {
  const unit = num(line.unit_price);
  return {
    item_type: line.item_type,
    service_name: line.service_name,
    description: line.description ?? null,
    quantity: num(line.quantity) || 1,
    unit_price: unit,
    price: unit,
    discount_percent: num(line.discount_percent),
    total_price: num(line.total_price),
    status: line.deferred ? "pending_fulfillment" : "pending",
    deposit_required: line.deposit_required === true,
    location_deposit_amount: line.location_deposit_amount ?? null,
    location_deposit_paid: false,
  };
}

/**
 * Reproduce an order's line items from an agreement.
 *
 * Reads line_items_snapshot so every line comes back exactly as it went
 * in — coffee, coolers, financing and custom lines included, with their
 * discounts intact. Falls back to the scalar columns only for
 * pre-migration-176 agreements that have no snapshot.
 */
export function buildOrderItemsFromAgreement(ag: Row): RebuiltOrderItem[] {
  const snapshot = ag.line_items_snapshot as SnapshotLine[] | null | undefined;
  if (Array.isArray(snapshot) && snapshot.length > 0) {
    return snapshot.map(itemFromSnapshotLine);
  }
  return legacyItemsFromScalars(ag);
}

function legacyEquipmentItem(ag: Row): RebuiltOrderItem | null {
  if (ag.include_equipment === false) return null;
  const qty = num(ag.machine_quantity);
  if (qty <= 0) return null;

  const unit = num(ag.machine_unit_price);
  return {
    item_type: "machine_sale",
    service_name: text(ag.machine_model) || "VendEra AI Machine",
    description: (ag.machine_notes as string) ?? null,
    quantity: qty,
    unit_price: unit,
    price: unit,
    discount_percent: 0,
    total_price: round2(qty * unit),
    status: "pending",
    deposit_required: false,
  };
}

function legacyLocationItems(ag: Row): RebuiltOrderItem[] {
  if (ag.include_location_services === false) return [];
  const qty = num(ag.locations_purchased);
  if (qty <= 0) return [];

  const fee = num(ag.location_fee_per_secured);
  const total = round2(qty * fee);
  const depositOnly = ag.location_services_deposit_only === true;

  if (!depositOnly) {
    return [
      {
        item_type: "location_services",
        service_name: "Location Sourcing & Placement",
        description: `${plural(qty, "location")} at ${money(fee)} each`,
        quantity: qty,
        unit_price: fee,
        price: fee,
        discount_percent: 0,
        total_price: total,
        status: "pending",
        deposit_required: false,
      },
    ];
  }

  const deposit = Math.min(num(ag.location_services_deposit_amount), total);
  const remaining = round2(Math.max(0, total - deposit));
  const items: RebuiltOrderItem[] = [
    {
      item_type: "location_services",
      service_name: "Location Services Deposit",
      description: `Non-refundable deposit for ${plural(qty, "location")} (${money(total)} total)`,
      quantity: 1,
      unit_price: deposit,
      price: deposit,
      discount_percent: 0,
      total_price: deposit,
      status: "pending",
      deposit_required: false,
    },
  ];

  if (remaining > 0) {
    items.push({
      item_type: "location_services",
      service_name: "Location Services Remaining Balance",
      description: "Balance due after fulfillment of secured locations.",
      quantity: 1,
      unit_price: remaining,
      price: remaining,
      discount_percent: 0,
      total_price: remaining,
      status: "pending_fulfillment",
      deposit_required: false,
    });
  }
  return items;
}

function legacyFreightItem(ag: Row): RebuiltOrderItem | null {
  if (ag.include_shipping_storage === false) return null;
  const freight = num(ag.freight_total);
  if (freight <= 0) return null;

  return {
    item_type: "freight",
    service_name: "Shipping & Freight",
    description: `Freight at ${money(num(ag.freight_per_machine))} per machine`,
    quantity: 1,
    unit_price: freight,
    price: freight,
    discount_percent: 0,
    total_price: freight,
    status: "pending",
    deposit_required: false,
  };
}

/** Pre-176 agreements only: rebuild what the scalar columns can express. */
function legacyItemsFromScalars(ag: Row): RebuiltOrderItem[] {
  const items: RebuiltOrderItem[] = [];
  const equipment = legacyEquipmentItem(ag);
  if (equipment) items.push(equipment);
  items.push(...legacyLocationItems(ag));
  const freight = legacyFreightItem(ag);
  if (freight) items.push(freight);
  return items;
}
