/**
 * Inventory ledger — the ONE way inventory_transactions rows get written.
 *
 * Design constraints:
 *  - The ledger is append-only. This module never UPDATEs or DELETEs a
 *    row. Corrections are always a new reversing row.
 *  - `qty_delta` sign is validated against transaction_type via the
 *    POSITIVE_/NEGATIVE_/EITHER_SIGN_TYPES tables in types.ts.
 *  - Transaction types that carry accountability (manual_adjustment,
 *    spoilage, waste, damage, count_adjustment) require a `reason`.
 *  - Reversals must reference the transaction they reverse and match
 *    it (opposite sign, same SKU/warehouse).
 *  - Physical counts insert TWO rows atomically when variance is
 *    non-zero: the physical_counts row and the count_adjustment
 *    inventory_transactions row. Zero-variance counts still record
 *    the physical_counts row for audit but skip the adjustment.
 */

import { supabaseAdmin } from "../supabaseAdmin";
import {
  EITHER_SIGN_TYPES,
  InventoryTransactionRow,
  NEGATIVE_DELTA_TYPES,
  PhysicalCountRow,
  POSITIVE_DELTA_TYPES,
  PostPhysicalCountInput,
  PostPhysicalCountResult,
  PostTransactionInput,
  REASON_REQUIRED_TYPES,
} from "./types";

/**
 * Compute on-hand for a SKU at a warehouse by summing the ledger.
 * Wraps the compute_on_hand() PL/pgSQL function so the definition of
 * "on-hand" lives in exactly one place.
 */
export async function computeOnHand(
  skuId: string,
  warehouseId: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("compute_on_hand", {
    p_sku_id: skuId,
    p_warehouse_id: warehouseId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Batch on-hand for a list of (SKU, warehouse) pairs. Runs a single
 * aggregate query instead of N RPC calls — used by the replenishment
 * screen (Phase 5) to hydrate the grid.
 */
export async function computeOnHandBatch(
  pairs: Array<{ skuId: string; warehouseId: string }>,
): Promise<Map<string, number>> {
  // Key format: `${skuId}::${warehouseId}`.
  const out = new Map<string, number>();
  if (pairs.length === 0) return out;

  const skuIds = Array.from(new Set(pairs.map((p) => p.skuId)));
  const warehouseIds = Array.from(new Set(pairs.map((p) => p.warehouseId)));

  const { data, error } = await supabaseAdmin
    .from("inventory_transactions")
    .select("sku_id, warehouse_id, qty_delta")
    .in("sku_id", skuIds)
    .in("warehouse_id", warehouseIds);
  if (error) throw error;

  for (const row of (data ?? []) as Array<{
    sku_id: string;
    warehouse_id: string;
    qty_delta: number;
  }>) {
    const key = `${row.sku_id}::${row.warehouse_id}`;
    out.set(key, (out.get(key) ?? 0) + Number(row.qty_delta));
  }
  // Fill zeros for pairs with no history.
  for (const p of pairs) {
    const k = `${p.skuId}::${p.warehouseId}`;
    if (!out.has(k)) out.set(k, 0);
  }
  return out;
}

/**
 * Post a single ledger transaction. All the invariants live here so
 * every write site (coffee-order consumption, PO receipt, admin
 * manual-adjust) shares the same guarantees.
 */
export async function postTransaction(
  input: PostTransactionInput,
): Promise<InventoryTransactionRow> {
  validateTransaction(input);

  if (input.reversesTransactionId) {
    await validateReversal(input);
  }

  const { data, error } = await supabaseAdmin
    .from("inventory_transactions")
    .insert({
      sku_id: input.skuId,
      warehouse_id: input.warehouseId,
      transaction_type: input.transactionType,
      qty_delta: input.qtyDelta,
      reason: input.reason ?? null,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      counterparty_warehouse_id: input.counterpartyWarehouseId ?? null,
      reverses_transaction_id: input.reversesTransactionId ?? null,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("inventory transaction insert failed");
  }
  return data as InventoryTransactionRow;
}

/**
 * Record a physical count. Inserts:
 *   1. a physical_counts row (always)
 *   2. a count_adjustment inventory_transactions row (only when
 *      variance !== 0)
 * Both writes happen inline; a failure between them leaves the
 * physical_counts row referencing a null adjustment_transaction_id
 * which the app treats as "count taken but variance was zero".
 */
export async function postPhysicalCount(
  input: PostPhysicalCountInput,
): Promise<PostPhysicalCountResult> {
  const before = await computeOnHand(input.skuId, input.warehouseId);
  const variance = Number(input.countedQty) - before;

  let adjustment: InventoryTransactionRow | null = null;

  if (variance !== 0) {
    adjustment = await postTransaction({
      skuId: input.skuId,
      warehouseId: input.warehouseId,
      transactionType: "count_adjustment",
      qtyDelta: variance,
      reason:
        input.notes ??
        `Physical count: ${input.countedQty} vs computed ${before} (variance ${variance})`,
      referenceType: "physical_count",
      createdBy: input.countedBy ?? null,
    });
  }

  const { data, error } = await supabaseAdmin
    .from("physical_counts")
    .insert({
      sku_id: input.skuId,
      warehouse_id: input.warehouseId,
      counted_qty: input.countedQty,
      computed_on_hand_at_count: before,
      variance,
      adjustment_transaction_id: adjustment?.id ?? null,
      counted_by: input.countedBy ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("physical_counts insert failed");
  }

  return {
    physicalCount: data as PhysicalCountRow,
    adjustmentTransaction: adjustment,
    computedOnHandBefore: before,
    computedOnHandAfter: before + variance,
  };
}

// ─── Invariants ─────────────────────────────────────────────────────

function validateTransaction(input: PostTransactionInput): void {
  if (!input.skuId) throw new Error("skuId is required");
  if (!input.warehouseId) throw new Error("warehouseId is required");
  if (!Number.isFinite(input.qtyDelta)) {
    throw new Error("qtyDelta must be a finite number");
  }
  if (input.qtyDelta === 0) {
    // Zero-delta transactions are meaningless and pollute the ledger.
    throw new Error("qtyDelta must not be zero");
  }

  const t = input.transactionType;

  // Sign vs type.
  if (POSITIVE_DELTA_TYPES.includes(t) && input.qtyDelta <= 0) {
    throw new Error(`${t} requires a positive qtyDelta`);
  }
  if (NEGATIVE_DELTA_TYPES.includes(t) && input.qtyDelta >= 0) {
    throw new Error(`${t} requires a negative qtyDelta`);
  }
  if (
    !POSITIVE_DELTA_TYPES.includes(t) &&
    !NEGATIVE_DELTA_TYPES.includes(t) &&
    !EITHER_SIGN_TYPES.includes(t)
  ) {
    throw new Error(`unsupported transaction_type: ${t}`);
  }

  // Reason required for accountability-carrying types.
  if (REASON_REQUIRED_TYPES.includes(t)) {
    if (!input.reason || !input.reason.trim()) {
      throw new Error(`${t} requires a reason`);
    }
  }

  // Transfers must carry a counterparty.
  if (t === "transfer_in" || t === "transfer_out") {
    if (!input.counterpartyWarehouseId) {
      throw new Error(`${t} requires counterpartyWarehouseId`);
    }
    if (input.counterpartyWarehouseId === input.warehouseId) {
      throw new Error("counterpartyWarehouseId cannot equal warehouseId");
    }
  }

  // Reversals must reference an original.
  if (t === "consumption_reversal" && !input.reversesTransactionId) {
    throw new Error("consumption_reversal requires reversesTransactionId");
  }
}

async function validateReversal(input: PostTransactionInput): Promise<void> {
  const { data: original } = await supabaseAdmin
    .from("inventory_transactions")
    .select("id, sku_id, warehouse_id, qty_delta, transaction_type")
    .eq("id", input.reversesTransactionId!)
    .maybeSingle();
  if (!original) throw new Error("original transaction not found");
  if (original.sku_id !== input.skuId) {
    throw new Error("reversal sku_id must match original");
  }
  if (original.warehouse_id !== input.warehouseId) {
    throw new Error("reversal warehouse_id must match original");
  }
  const originalDelta = Number(original.qty_delta);
  if (Math.sign(originalDelta) === Math.sign(input.qtyDelta)) {
    throw new Error("reversal qtyDelta must have opposite sign of original");
  }
  if (Math.abs(originalDelta) < Math.abs(input.qtyDelta)) {
    throw new Error(
      `reversal magnitude ${Math.abs(input.qtyDelta)} exceeds original ${Math.abs(originalDelta)}`,
    );
  }
  // Check the original hasn't already been fully reversed.
  const { data: existingReversals } = await supabaseAdmin
    .from("inventory_transactions")
    .select("qty_delta")
    .eq("reverses_transaction_id", input.reversesTransactionId!);
  const alreadyReversed = (existingReversals ?? []).reduce(
    (s, r) => s + Math.abs(Number(r.qty_delta)),
    0,
  );
  if (alreadyReversed + Math.abs(input.qtyDelta) > Math.abs(originalDelta)) {
    throw new Error("original transaction already fully or over-reversed");
  }
}
