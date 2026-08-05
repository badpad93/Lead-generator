/**
 * Coffee order → inventory ledger bridge.
 *
 * Owns both directions:
 *   postConsumptionForCoffeeOrder    — coffee_orders.status flips into
 *                                       'shipped' → write one
 *                                       `consumption` transaction per
 *                                       coffee_order_items row.
 *   reverseConsumptionForCoffeeOrder — coffee_orders.status flips from
 *                                       'shipped' → 'cancelled' →
 *                                       write one `consumption_reversal`
 *                                       per original consumption row.
 *
 * Both are idempotent:
 *   - postConsumption checks for existing consumption transactions
 *     tagged with reference_type='coffee_order' + reference_id=order_id.
 *     Skips items already covered so retries never double-deduct.
 *   - reverseConsumption checks for existing consumption_reversal
 *     transactions on the original consumption ids. Skips those already
 *     reversed.
 *
 * SKU resolution: coffee_order_items.product_id → inventory_skus.
 * coffee_product_id. If a product has no matching inventory SKU (e.g.
 * admin hasn't set one up yet), we log a warning and skip that line
 * rather than failing the whole shipment. The result surfaces the
 * skipped lines so the caller can decide whether to alert.
 *
 * Warehouse: single-warehouse today — resolves to the first active
 * warehouse (ordered by created_at). Phase 7 will route per-order to
 * the fulfilling warehouse instead.
 */

import { supabaseAdmin } from "../supabaseAdmin";
import { postTransaction } from "./ledger";

export interface ConsumptionResult {
  orderId: string;
  warehouseId: string | null;
  writtenTransactionIds: string[];
  skippedNoSku: Array<{ product_id: string | null; product_name: string | null; quantity: number }>;
  skippedAlreadyPosted: number;
}

export interface ReversalResult {
  orderId: string;
  reversedTransactionIds: string[];
  skippedAlreadyReversed: number;
}

async function firstActiveWarehouseId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("warehouses")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function existingConsumptionByProduct(
  orderId: string,
): Promise<Map<string, { id: string; qty: number }[]>> {
  // Index existing consumption rows for this order by the sku_id they
  // touched, so we can compare against the current items and skip any
  // that already have coverage.
  const { data } = await supabaseAdmin
    .from("inventory_transactions")
    .select("id, sku_id, qty_delta")
    .eq("reference_type", "coffee_order")
    .eq("reference_id", orderId)
    .eq("transaction_type", "consumption");
  const map = new Map<string, { id: string; qty: number }[]>();
  for (const row of (data ?? []) as Array<{ id: string; sku_id: string; qty_delta: number }>) {
    const list = map.get(row.sku_id) ?? [];
    list.push({ id: row.id, qty: Math.abs(Number(row.qty_delta)) });
    map.set(row.sku_id, list);
  }
  return map;
}

export async function postConsumptionForCoffeeOrder(
  orderId: string,
  actorId?: string | null,
): Promise<ConsumptionResult> {
  const warehouseId = await firstActiveWarehouseId();
  const result: ConsumptionResult = {
    orderId,
    warehouseId,
    writtenTransactionIds: [],
    skippedNoSku: [],
    skippedAlreadyPosted: 0,
  };
  if (!warehouseId) {
    console.warn("[coffeeOrderConsumption] no active warehouse — skipping consumption");
    return result;
  }

  const { data: items } = await supabaseAdmin
    .from("coffee_order_items")
    .select("id, product_id, product_name, quantity")
    .eq("order_id", orderId);
  const itemList = (items ?? []) as Array<{
    id: string;
    product_id: string | null;
    product_name: string | null;
    quantity: number;
  }>;

  if (itemList.length === 0) return result;

  // Resolve every product_id to an inventory SKU in one query.
  const productIds = Array.from(new Set(itemList.map((i) => i.product_id).filter(Boolean) as string[]));
  const productToSku = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: skus } = await supabaseAdmin
      .from("inventory_skus")
      .select("id, coffee_product_id")
      .in("coffee_product_id", productIds);
    for (const s of (skus ?? []) as Array<{ id: string; coffee_product_id: string }>) {
      productToSku.set(s.coffee_product_id, s.id);
    }
  }

  const existingByProduct = await existingConsumptionByProduct(orderId);

  for (const item of itemList) {
    if (!item.product_id) {
      result.skippedNoSku.push({
        product_id: null,
        product_name: item.product_name,
        quantity: Number(item.quantity),
      });
      continue;
    }
    const skuId = productToSku.get(item.product_id);
    if (!skuId) {
      result.skippedNoSku.push({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.quantity),
      });
      continue;
    }

    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    // Idempotency: if an existing consumption row for this SKU on this
    // order already covers the current quantity, skip. If it covers
    // less, top up with the difference (rare but possible if a partial
    // fulfillment was recorded manually before).
    const existing = existingByProduct.get(skuId) ?? [];
    const alreadyPosted = existing.reduce((s, e) => s + e.qty, 0);
    const needed = qty - alreadyPosted;
    if (needed <= 0) {
      result.skippedAlreadyPosted += 1;
      continue;
    }

    try {
      const row = await postTransaction({
        skuId,
        warehouseId,
        transactionType: "consumption",
        qtyDelta: -needed,
        referenceType: "coffee_order",
        referenceId: orderId,
        notes:
          alreadyPosted > 0
            ? `Coffee order fulfillment (top-up: prior ${alreadyPosted}, needed ${qty})`
            : "Coffee order fulfillment",
        createdBy: actorId ?? null,
      });
      result.writtenTransactionIds.push(row.id);
    } catch (err) {
      console.error("[coffeeOrderConsumption] consumption insert failed:", err);
    }
  }

  return result;
}

export async function reverseConsumptionForCoffeeOrder(
  orderId: string,
  actorId?: string | null,
): Promise<ReversalResult> {
  const result: ReversalResult = {
    orderId,
    reversedTransactionIds: [],
    skippedAlreadyReversed: 0,
  };

  // Every consumption row for this order.
  const { data: consumptions } = await supabaseAdmin
    .from("inventory_transactions")
    .select("id, sku_id, warehouse_id, qty_delta")
    .eq("reference_type", "coffee_order")
    .eq("reference_id", orderId)
    .eq("transaction_type", "consumption");
  const rows = (consumptions ?? []) as Array<{
    id: string;
    sku_id: string;
    warehouse_id: string;
    qty_delta: number;
  }>;
  if (rows.length === 0) return result;

  // Find which of those are already fully reversed.
  const { data: existingReversals } = await supabaseAdmin
    .from("inventory_transactions")
    .select("reverses_transaction_id, qty_delta")
    .in(
      "reverses_transaction_id",
      rows.map((r) => r.id),
    );
  const reversedByOriginal = new Map<string, number>();
  for (const r of (existingReversals ?? []) as Array<{
    reverses_transaction_id: string;
    qty_delta: number;
  }>) {
    reversedByOriginal.set(
      r.reverses_transaction_id,
      (reversedByOriginal.get(r.reverses_transaction_id) ?? 0) + Math.abs(Number(r.qty_delta)),
    );
  }

  for (const row of rows) {
    const originalMagnitude = Math.abs(Number(row.qty_delta));
    const alreadyReversed = reversedByOriginal.get(row.id) ?? 0;
    const remaining = originalMagnitude - alreadyReversed;
    if (remaining <= 0) {
      result.skippedAlreadyReversed += 1;
      continue;
    }
    try {
      const inserted = await postTransaction({
        skuId: row.sku_id,
        warehouseId: row.warehouse_id,
        transactionType: "consumption_reversal",
        qtyDelta: remaining, // positive to put stock back
        reversesTransactionId: row.id,
        referenceType: "coffee_order",
        referenceId: orderId,
        notes: "Coffee order cancelled after fulfillment",
        createdBy: actorId ?? null,
      });
      result.reversedTransactionIds.push(inserted.id);
    } catch (err) {
      console.error("[coffeeOrderConsumption] reversal insert failed:", err);
    }
  }

  return result;
}
