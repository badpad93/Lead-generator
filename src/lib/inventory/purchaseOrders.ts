/**
 * Purchase Orders — service layer.
 *
 * Owns the state machine and the invariants nobody outside this file
 * gets to bypass:
 *
 *   draft
 *     → sent          (send)
 *     → cancelled     (cancel)
 *   sent
 *     → partially_received (first receipt when < ordered total)
 *     → received           (receipt brings a line to full and no
 *                           unreceived lines remain)
 *     → cancelled          (cancel while nothing has been received)
 *   partially_received
 *     → received      (final receipt clears remaining)
 *     → closed        (admin force-closes with remaining unreceived)
 *   received
 *     → closed        (terminal wrap, no more receipts allowed)
 *
 * Guarantees:
 *   - Line-level unique (purchase_order_id, sku_id) — one line per SKU
 *     per PO. Multi-SKU orders create multiple lines.
 *   - Receipts refuse to over-receive a line.
 *   - Cancellation refuses once any receipt has posted.
 *   - Every receipt writes a corresponding `receipt` ledger row via
 *     the Phase 1 postTransaction() helper. The receipt row is the
 *     bridge; the ledger row is what moves stock.
 *   - purchase_order_lines.received_qty is a CACHED rollup; the truth
 *     is purchase_order_receipts. The service updates the cache
 *     every time it inserts a receipt so listings stay fast.
 *   - status recomputes automatically after every receipt.
 */

import { supabaseAdmin } from "../supabaseAdmin";
import { postTransaction } from "./ledger";

export type PurchaseOrderStatus =
  | "draft"
  | "sent"
  | "partially_received"
  | "received"
  | "cancelled"
  | "closed";

export interface PurchaseOrderLineInput {
  sku_id: string;
  ordered_qty: number;
  unit_cost_cents?: number | null;
  line_total_cents?: number | null;
  notes?: string | null;
}

export interface CreatePurchaseOrderInput {
  supplier_id: string;
  warehouse_id: string;
  expected_delivery_date?: string | null;
  supplier_reference?: string | null;
  notes?: string | null;
  replenishment_run_id?: string | null;
  lines: PurchaseOrderLineInput[];
  subtotal_cents?: number | null;
  shipping_cents?: number | null;
  tax_cents?: number | null;
  total_cents?: number | null;
  created_by?: string | null;
}

export interface ReceiveLineInput {
  purchase_order_line_id: string;
  received_qty: number;
  notes?: string | null;
}

export interface PurchaseOrderRow {
  id: string;
  po_number: string;
  supplier_id: string;
  warehouse_id: string;
  status: PurchaseOrderStatus;
  replenishment_run_id: string | null;
  subtotal_cents: number | null;
  shipping_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  expected_delivery_date: string | null;
  supplier_reference: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  sent_at: string | null;
  sent_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  closed_at: string | null;
  closed_by: string | null;
}

export interface PurchaseOrderLineRow {
  id: string;
  purchase_order_id: string;
  sku_id: string;
  line_number: number;
  ordered_qty: number;
  received_qty: number;
  unit_cost_cents: number | null;
  line_total_cents: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderReceiptRow {
  id: string;
  purchase_order_id: string;
  purchase_order_line_id: string;
  warehouse_id: string;
  received_qty: number;
  inventory_transaction_id: string | null;
  received_by: string | null;
  received_at: string;
  notes: string | null;
}

// ─── Create ─────────────────────────────────────────────────────────

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<{ purchaseOrder: PurchaseOrderRow; lines: PurchaseOrderLineRow[] }> {
  if (!input.lines || input.lines.length === 0) {
    throw new Error("purchase order must have at least one line");
  }
  // Guard: duplicate SKU on the same PO would fail the DB unique
  // constraint; catch here for a clearer error.
  const seenSkus = new Set<string>();
  for (const line of input.lines) {
    if (seenSkus.has(line.sku_id)) {
      throw new Error(`duplicate line for sku_id ${line.sku_id}`);
    }
    seenSkus.add(line.sku_id);
    if (!(line.ordered_qty > 0)) {
      throw new Error(`ordered_qty must be > 0 for sku ${line.sku_id}`);
    }
  }

  const { data: po, error: poErr } = await supabaseAdmin
    .from("purchase_orders")
    .insert({
      supplier_id: input.supplier_id,
      warehouse_id: input.warehouse_id,
      status: "draft",
      expected_delivery_date: input.expected_delivery_date ?? null,
      supplier_reference: input.supplier_reference ?? null,
      notes: input.notes ?? null,
      replenishment_run_id: input.replenishment_run_id ?? null,
      subtotal_cents: input.subtotal_cents ?? null,
      shipping_cents: input.shipping_cents ?? null,
      tax_cents: input.tax_cents ?? null,
      total_cents: input.total_cents ?? null,
      created_by: input.created_by ?? null,
    })
    .select("*")
    .single();
  if (poErr || !po) throw poErr ?? new Error("purchase order insert failed");

  const lineRows = input.lines.map((line, i) => ({
    purchase_order_id: po.id,
    sku_id: line.sku_id,
    line_number: i + 1,
    ordered_qty: line.ordered_qty,
    unit_cost_cents: line.unit_cost_cents ?? null,
    line_total_cents: line.line_total_cents ?? null,
    notes: line.notes ?? null,
  }));
  const { data: lines, error: linesErr } = await supabaseAdmin
    .from("purchase_order_lines")
    .insert(lineRows)
    .select("*");
  if (linesErr) {
    // Roll back the parent PO so we don't leave an orphaned draft.
    await supabaseAdmin.from("purchase_orders").delete().eq("id", po.id);
    throw linesErr;
  }

  return {
    purchaseOrder: po as PurchaseOrderRow,
    lines: (lines ?? []) as PurchaseOrderLineRow[],
  };
}

// ─── Send ───────────────────────────────────────────────────────────

export async function sendPurchaseOrder(
  poId: string,
  sentBy: string | null,
): Promise<PurchaseOrderRow> {
  const { data: current } = await supabaseAdmin
    .from("purchase_orders")
    .select("status")
    .eq("id", poId)
    .maybeSingle();
  if (!current) throw new Error("purchase order not found");
  if (current.status !== "draft") {
    throw new Error(`cannot send PO in status ${current.status}`);
  }
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("purchase_orders")
    .update({ status: "sent", sent_at: nowIso, sent_by: sentBy, updated_at: nowIso })
    .eq("id", poId)
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("send failed");
  return data as PurchaseOrderRow;
}

// ─── Cancel ─────────────────────────────────────────────────────────

export async function cancelPurchaseOrder(
  poId: string,
  reason: string,
  cancelledBy: string | null,
): Promise<PurchaseOrderRow> {
  if (!reason || !reason.trim()) throw new Error("cancellation reason is required");
  const { data: current } = await supabaseAdmin
    .from("purchase_orders")
    .select("status")
    .eq("id", poId)
    .maybeSingle();
  if (!current) throw new Error("purchase order not found");
  if (current.status !== "draft" && current.status !== "sent") {
    throw new Error(
      `cannot cancel PO in status ${current.status} — use close if partially received`,
    );
  }
  // Refuse if any receipts exist (belt-and-suspenders — status check
  // already catches this because partially_received is exempt above).
  const { count: receiptCount } = await supabaseAdmin
    .from("purchase_order_receipts")
    .select("*", { count: "exact", head: true })
    .eq("purchase_order_id", poId);
  if ((receiptCount ?? 0) > 0) {
    throw new Error("cannot cancel PO with existing receipts");
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("purchase_orders")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      cancelled_by: cancelledBy,
      cancellation_reason: reason.trim(),
      updated_at: nowIso,
    })
    .eq("id", poId)
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("cancel failed");
  return data as PurchaseOrderRow;
}

// ─── Close ──────────────────────────────────────────────────────────

export async function closePurchaseOrder(
  poId: string,
  closedBy: string | null,
): Promise<PurchaseOrderRow> {
  const { data: current } = await supabaseAdmin
    .from("purchase_orders")
    .select("status")
    .eq("id", poId)
    .maybeSingle();
  if (!current) throw new Error("purchase order not found");
  if (!["partially_received", "received"].includes(current.status)) {
    throw new Error(`cannot close PO in status ${current.status}`);
  }
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("purchase_orders")
    .update({ status: "closed", closed_at: nowIso, closed_by: closedBy, updated_at: nowIso })
    .eq("id", poId)
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("close failed");
  return data as PurchaseOrderRow;
}

// ─── Receive ────────────────────────────────────────────────────────

export async function receiveLines(
  poId: string,
  receipts: ReceiveLineInput[],
  receivedBy: string | null,
): Promise<{
  purchaseOrder: PurchaseOrderRow;
  receiptRows: PurchaseOrderReceiptRow[];
}> {
  if (receipts.length === 0) throw new Error("at least one receipt is required");

  // Load PO + lines to validate.
  const { data: po } = await supabaseAdmin
    .from("purchase_orders")
    .select("*")
    .eq("id", poId)
    .maybeSingle();
  if (!po) throw new Error("purchase order not found");
  if (!["sent", "partially_received"].includes(po.status)) {
    throw new Error(`cannot receive against PO in status ${po.status}`);
  }

  const lineIds = receipts.map((r) => r.purchase_order_line_id);
  const { data: lines } = await supabaseAdmin
    .from("purchase_order_lines")
    .select("*")
    .eq("purchase_order_id", poId)
    .in("id", lineIds);
  const linesById = new Map<string, PurchaseOrderLineRow>();
  for (const l of (lines ?? []) as PurchaseOrderLineRow[]) linesById.set(l.id, l);

  // Validate every receipt line before writing anything.
  for (const r of receipts) {
    const line = linesById.get(r.purchase_order_line_id);
    if (!line) throw new Error(`line ${r.purchase_order_line_id} not on this PO`);
    if (!(r.received_qty > 0)) throw new Error(`received_qty must be > 0`);
    const remaining = Number(line.ordered_qty) - Number(line.received_qty);
    if (Number(r.received_qty) > remaining) {
      throw new Error(
        `receipt ${r.received_qty} exceeds remaining ${remaining} on line ${line.id}`,
      );
    }
  }

  const receiptRows: PurchaseOrderReceiptRow[] = [];

  // For each receipt: write ledger row, insert receipt audit row,
  // bump line.received_qty. Any failure mid-batch leaves prior
  // successful receipts in place (they're independent physical
  // events); we surface the error and let the caller decide what to
  // do about the tail.
  for (const r of receipts) {
    const line = linesById.get(r.purchase_order_line_id)!;

    const ledgerRow = await postTransaction({
      skuId: line.sku_id,
      warehouseId: po.warehouse_id,
      transactionType: "receipt",
      qtyDelta: Number(r.received_qty),
      referenceType: "purchase_order",
      referenceId: poId,
      notes:
        r.notes ??
        `PO ${po.po_number} receipt (line ${line.line_number}, ${r.received_qty} units)`,
      createdBy: receivedBy,
    });

    const { data: receipt, error: receiptErr } = await supabaseAdmin
      .from("purchase_order_receipts")
      .insert({
        purchase_order_id: poId,
        purchase_order_line_id: line.id,
        warehouse_id: po.warehouse_id,
        received_qty: r.received_qty,
        inventory_transaction_id: ledgerRow.id,
        received_by: receivedBy,
        notes: r.notes ?? null,
      })
      .select("*")
      .single();
    if (receiptErr || !receipt) throw receiptErr ?? new Error("receipt insert failed");
    receiptRows.push(receipt as PurchaseOrderReceiptRow);

    const newReceivedQty = Number(line.received_qty) + Number(r.received_qty);
    const { error: updateErr } = await supabaseAdmin
      .from("purchase_order_lines")
      .update({ received_qty: newReceivedQty, updated_at: new Date().toISOString() })
      .eq("id", line.id);
    if (updateErr) throw updateErr;
    // Update the in-memory copy so subsequent receipts in this batch
    // see the correct running total.
    line.received_qty = newReceivedQty;
  }

  // Recompute PO status.
  const allLinesFresh = await supabaseAdmin
    .from("purchase_order_lines")
    .select("ordered_qty, received_qty")
    .eq("purchase_order_id", poId);
  const totals = (allLinesFresh.data ?? []) as Array<{ ordered_qty: number; received_qty: number }>;
  const fullyReceived = totals.every((l) => Number(l.received_qty) >= Number(l.ordered_qty));
  const anyReceived = totals.some((l) => Number(l.received_qty) > 0);
  const newStatus: PurchaseOrderStatus = fullyReceived
    ? "received"
    : anyReceived
      ? "partially_received"
      : "sent";

  const { data: updatedPo, error: statusErr } = await supabaseAdmin
    .from("purchase_orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", poId)
    .select("*")
    .single();
  if (statusErr || !updatedPo) throw statusErr ?? new Error("PO status update failed");

  return { purchaseOrder: updatedPo as PurchaseOrderRow, receiptRows };
}
