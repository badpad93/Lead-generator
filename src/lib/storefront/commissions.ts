/**
 * Storefront commission ledger — server-side write helpers.
 *
 * Every dollar of operator commission enters the ledger through this
 * module. Callers are:
 *   - Checkout: `recordOrderCommissions` writes one 'pending' row
 *     per line item at coffee_order creation time. The row carries
 *     the pricing snapshot verbatim from `resolveCart`.
 *   - QB Payments webhook: `settleCommissionsForPayment` flips
 *     'pending' -> 'payable' when funds clear.
 *   - Refund webhook / admin refund: `reverseCommissionsForRefund`
 *     writes NEGATIVE-amount rows referencing the originals via
 *     reversed_of_id (append-only — we never edit).
 *   - Admin adjustments: `adjustCommission` writes a signed
 *     adjustment row and records an audit event.
 *   - Payout: `markCommissionsScheduled` / `markCommissionsPaid`
 *     stamp the QB Bill lifecycle.
 *
 * Idempotency: the DB has UNIQUE(idempotency_key). Every write
 * constructs its key deterministically so a duplicated webhook
 * (or a retried admin action) collapses to a single row.
 *   settle:{payment_id}:{order_item_id}
 *   refund:{refund_id}:{order_item_id}
 *   adjust:{admin_id}:{order_item_id}:{iso_ts}
 *
 * Money: NUMERIC(12,2). All amounts here are plain JS numbers
 * rounded to 2dp before insert; the pricing resolver has already
 * done that, and this module doesn't reshape amounts.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recordAuditEvent } from "@/lib/storefront/audit";
import { round2 } from "@/lib/coffeePricing";

/**
 * Minimal per-line money snapshot the ledger needs — index-aligned
 * with the caller's inserted coffee_order_items rows. Replaces the
 * old dependency on the standalone storefront resolver's
 * ResolvedCart (that resolver was collapsed into
 * resolveCoffeeProductsPricing's storefront overlay).
 */
export interface CommissionCartLine {
  base_price_amount: number;
  tenant_price_amount: number;
  commission_amount: number;
  quantity: number;
}
export interface CommissionCart {
  lines: CommissionCartLine[];
}

// ─── Types ────────────────────────────────────────────────────────

export type CommissionStatus =
  | "pending"
  | "payable"
  | "scheduled"
  | "paid"
  | "reversed"
  | "on_hold"
  | "cancelled";

export interface CommissionRow {
  id: string;
  tenant_id: string;
  customer_profile_id: string;
  coffee_order_id: string;
  coffee_order_item_id: string;
  qb_invoice_id: string | null;
  qb_payment_id: string | null;
  settled_payment_ref_id: string | null;
  settled_at: string | null;
  base_price_amount: number;
  tenant_price_amount: number;
  commission_amount: number;
  quantity: number;
  status: CommissionStatus;
  earned_at: string;
  payable_at: string | null;
  scheduled_at: string | null;
  paid_at: string | null;
  qb_bill_id: string | null;
  qb_bill_payment_id: string | null;
  reversed_of_id: string | null;
  reversal_reason: string | null;
  idempotency_key: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export class CommissionError extends Error {
  public code:
    | "MISSING_ORDER"
    | "MISSING_ITEM"
    | "MISSING_ROW"
    | "ALREADY_REVERSED"
    | "INVALID_STATUS_TRANSITION"
    | "SETTLEMENT_MISMATCH";
  constructor(code: CommissionError["code"], message: string) {
    super(message);
    this.name = "CommissionError";
    this.code = code;
  }
}

// ─── Order creation → pending rows ────────────────────────────────

export interface RecordOrderCommissionsInput {
  orderId: string;
  tenantId: string;
  customerProfileId: string;
  resolved: CommissionCart;
  /**
   * The coffee_order_items rows written for this order, in the same
   * order as resolved.lines. Passing them explicitly (rather than
   * re-querying) keeps this call cheap and lets the caller insert
   * items and commissions in a single transaction if it wants.
   */
  orderItemIds: string[];
  qbInvoiceId?: string | null;
  createdBy?: string | null;
}

/**
 * Write one 'pending' ledger row per line item. Commission remains
 * 'pending' until QB Payments confirms settlement — the payment
 * webhook flips it to 'payable' via `settleCommissionsForPayment`.
 *
 * Zero-commission lines are still written (as pending rows with
 * commission_amount=0) so refund reversals stay symmetric.
 */
export async function recordOrderCommissions(
  input: RecordOrderCommissionsInput,
): Promise<CommissionRow[]> {
  if (input.orderItemIds.length !== input.resolved.lines.length) {
    throw new CommissionError(
      "MISSING_ITEM",
      `orderItemIds length (${input.orderItemIds.length}) does not match resolved.lines length (${input.resolved.lines.length})`,
    );
  }
  const rows = input.resolved.lines.map((line, i) => {
    const itemId = input.orderItemIds[i];
    return {
      tenant_id: input.tenantId,
      customer_profile_id: input.customerProfileId,
      coffee_order_id: input.orderId,
      coffee_order_item_id: itemId,
      qb_invoice_id: input.qbInvoiceId ?? null,
      base_price_amount: round2(line.base_price_amount),
      tenant_price_amount: round2(line.tenant_price_amount),
      commission_amount: round2(line.commission_amount),
      quantity: line.quantity,
      status: "pending" as CommissionStatus,
      idempotency_key: `create:${input.orderId}:${itemId}`,
      created_by: input.createdBy ?? null,
    };
  });

  // Upsert on the idempotency_key so a re-run of order creation
  // (retry / crash resume) collapses to a single row per line.
  const { data, error } = await supabaseAdmin
    .from("storefront_commission_ledger")
    .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: false })
    .select("*");
  if (error) throw error;
  const inserted = (data ?? []) as CommissionRow[];

  await recordAuditEvent({
    tenantId: input.tenantId,
    actorId: input.createdBy ?? null,
    action: "commission.recorded",
    entityType: "coffee_order",
    entityId: input.orderId,
    after: {
      lines: inserted.length,
      commission_total: round2(
        input.resolved.lines.reduce((a, l) => a + l.commission_amount, 0),
      ),
    },
  });
  return inserted;
}

// ─── Settlement (QB Payments webhook) ─────────────────────────────

export interface SettleCommissionsInput {
  orderId: string;
  paymentId: string;
  settledPaymentRefId?: string | null;
  settledAt?: Date;
  qbInvoiceId?: string | null;
}

/**
 * Flip every 'pending' ledger row for this order to 'payable' and
 * stamp the QB payment refs. Idempotent — replays that come through
 * a duplicated webhook update rows that are already 'payable' to
 * the same state (updated_at bumps, but no double transition).
 * Rows already in a terminal state (paid, reversed, cancelled) are
 * left untouched so late-arriving webhooks can't zombie them.
 */
export async function settleCommissionsForPayment(
  input: SettleCommissionsInput,
): Promise<CommissionRow[]> {
  const settledAt = (input.settledAt ?? new Date()).toISOString();
  const { data, error } = await supabaseAdmin
    .from("storefront_commission_ledger")
    .update({
      status: "payable",
      payable_at: settledAt,
      qb_payment_id: input.paymentId,
      settled_payment_ref_id: input.settledPaymentRefId ?? input.paymentId,
      settled_at: settledAt,
      qb_invoice_id: input.qbInvoiceId ?? undefined,
    })
    .eq("coffee_order_id", input.orderId)
    .eq("status", "pending")
    .select("*");
  if (error) throw error;
  const rows = (data ?? []) as CommissionRow[];
  if (rows.length > 0) {
    await recordAuditEvent({
      tenantId: rows[0].tenant_id,
      action: "commission.settled",
      entityType: "coffee_order",
      entityId: input.orderId,
      after: {
        rows: rows.length,
        payment_id: input.paymentId,
        settled_at: settledAt,
      },
    });
  }
  return rows;
}

// ─── Refund reversal ──────────────────────────────────────────────

export interface RefundedLine {
  coffeeOrderItemId: string;
  refundQuantity: number; // must be > 0; may equal or be less than original qty
}

export interface ReverseCommissionsInput {
  orderId: string;
  refundId: string;                // stripe/qb refund id — used in idempotency key
  reason: string;
  lines: RefundedLine[];           // partial-refund shape; pass full lines for full refund
  actorId?: string | null;
}

/**
 * Write one negative-amount 'reversed' ledger row per refunded line,
 * referencing the ORIGINAL row via reversed_of_id. The reversal
 * amount is proportional to refunded quantity: e.g. a 2/3 quantity
 * refund on a $30 commission line writes a -$20 reversal.
 *
 * Rules:
 *   - The original row must exist and NOT already be fully reversed.
 *   - The original row's status can be pending, payable, scheduled,
 *     paid, or on_hold. If pending / payable, we mark the original
 *     row 'reversed' too so it stops moving through the payout
 *     pipeline. Paid rows stay as 'paid' — the reversal row is the
 *     financial correction.
 *   - Idempotency: refund:{refund_id}:{order_item_id}.
 */
export async function reverseCommissionsForRefund(
  input: ReverseCommissionsInput,
): Promise<CommissionRow[]> {
  const reversalRows: CommissionRow[] = [];

  for (const line of input.lines) {
    if (!line.refundQuantity || line.refundQuantity <= 0) continue;

    // Find the ORIGINAL row (must be positive-amount, not itself a reversal).
    const { data: origRow } = await supabaseAdmin
      .from("storefront_commission_ledger")
      .select("*")
      .eq("coffee_order_id", input.orderId)
      .eq("coffee_order_item_id", line.coffeeOrderItemId)
      .is("reversed_of_id", null)
      .maybeSingle();
    if (!origRow) {
      throw new CommissionError(
        "MISSING_ROW",
        `No original commission row for order ${input.orderId} item ${line.coffeeOrderItemId}`,
      );
    }
    const original = origRow as CommissionRow;

    if (Number(original.quantity) <= 0) continue;
    const refundQty = Math.min(Number(line.refundQuantity), Number(original.quantity));
    const proportion = refundQty / Number(original.quantity);
    const base = -round2(Number(original.base_price_amount) * proportion);
    const tenant = -round2(Number(original.tenant_price_amount) * proportion);
    const commission = -round2(Number(original.commission_amount) * proportion);

    // Insert the reversal row; upsert to make refund webhook replays safe.
    const { data, error } = await supabaseAdmin
      .from("storefront_commission_ledger")
      .upsert(
        {
          tenant_id: original.tenant_id,
          customer_profile_id: original.customer_profile_id,
          coffee_order_id: original.coffee_order_id,
          coffee_order_item_id: original.coffee_order_item_id,
          qb_invoice_id: original.qb_invoice_id,
          qb_payment_id: original.qb_payment_id,
          settled_payment_ref_id: original.settled_payment_ref_id,
          base_price_amount: base,
          tenant_price_amount: tenant,
          commission_amount: commission,
          quantity: -refundQty,
          status: "reversed",
          reversed_of_id: original.id,
          reversal_reason: input.reason,
          idempotency_key: `refund:${input.refundId}:${line.coffeeOrderItemId}`,
          created_by: input.actorId ?? null,
        },
        { onConflict: "idempotency_key", ignoreDuplicates: false },
      )
      .select("*")
      .single();
    if (error) throw error;
    reversalRows.push(data as CommissionRow);

    // If the original hasn't been paid yet, mark it 'reversed' so it stops
    // moving through the payout pipeline. Paid rows stay 'paid' — the
    // negative reversal row is the true financial correction.
    if (
      Number(original.quantity) === refundQty &&
      ["pending", "payable", "scheduled", "on_hold"].includes(original.status)
    ) {
      await supabaseAdmin
        .from("storefront_commission_ledger")
        .update({ status: "reversed", reversal_reason: input.reason })
        .eq("id", original.id);
    }
  }

  if (reversalRows.length > 0) {
    await recordAuditEvent({
      tenantId: reversalRows[0].tenant_id,
      actorId: input.actorId ?? null,
      action: "commission.reversed",
      entityType: "coffee_order",
      entityId: input.orderId,
      after: {
        refund_id: input.refundId,
        rows: reversalRows.length,
      },
      reason: input.reason,
    });
  }

  return reversalRows;
}

// ─── Manual adjustment ────────────────────────────────────────────

export interface AdjustCommissionInput {
  orderId: string;
  coffeeOrderItemId: string;
  adjustmentAmount: number;    // signed; positive credits the operator, negative debits
  reason: string;
  actorId: string;
}

export async function adjustCommission(input: AdjustCommissionInput): Promise<CommissionRow> {
  const { data: origRow } = await supabaseAdmin
    .from("storefront_commission_ledger")
    .select("*")
    .eq("coffee_order_id", input.orderId)
    .eq("coffee_order_item_id", input.coffeeOrderItemId)
    .is("reversed_of_id", null)
    .maybeSingle();
  if (!origRow) {
    throw new CommissionError(
      "MISSING_ROW",
      `No original row for order ${input.orderId} item ${input.coffeeOrderItemId}`,
    );
  }
  const original = origRow as CommissionRow;
  const nowIso = new Date().toISOString();
  const key = `adjust:${input.actorId}:${input.coffeeOrderItemId}:${nowIso}`;
  const { data, error } = await supabaseAdmin
    .from("storefront_commission_ledger")
    .insert({
      tenant_id: original.tenant_id,
      customer_profile_id: original.customer_profile_id,
      coffee_order_id: original.coffee_order_id,
      coffee_order_item_id: original.coffee_order_item_id,
      qb_invoice_id: original.qb_invoice_id,
      qb_payment_id: original.qb_payment_id,
      base_price_amount: 0,
      tenant_price_amount: 0,
      commission_amount: round2(input.adjustmentAmount),
      quantity: 0,
      status: original.status === "paid" ? "payable" : original.status,
      reversal_reason: input.reason,
      idempotency_key: key,
      created_by: input.actorId,
    })
    .select("*")
    .single();
  if (error) throw error;
  const row = data as CommissionRow;
  await recordAuditEvent({
    tenantId: original.tenant_id,
    actorId: input.actorId,
    action: "commission.adjusted",
    entityType: "storefront_commission_ledger",
    entityId: row.id,
    after: { amount: input.adjustmentAmount },
    reason: input.reason,
  });
  return row;
}

// ─── Hold / release ───────────────────────────────────────────────

export async function placeCommissionsOnHold(input: {
  tenantId: string;
  rowIds: string[];
  reason: string;
  actorId: string;
}): Promise<void> {
  if (input.rowIds.length === 0) return;
  const { error } = await supabaseAdmin
    .from("storefront_commission_ledger")
    .update({ status: "on_hold", notes: input.reason })
    .in("id", input.rowIds);
  if (error) throw error;
  await recordAuditEvent({
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "commission.hold_applied",
    entityType: "storefront_commission_ledger",
    after: { row_ids: input.rowIds, reason: input.reason },
    reason: input.reason,
  });
}

export async function releaseCommissionsFromHold(input: {
  tenantId: string;
  rowIds: string[];
  actorId: string;
}): Promise<void> {
  if (input.rowIds.length === 0) return;
  const { error } = await supabaseAdmin
    .from("storefront_commission_ledger")
    .update({ status: "payable", payable_at: new Date().toISOString() })
    .in("id", input.rowIds)
    .eq("status", "on_hold");
  if (error) throw error;
  await recordAuditEvent({
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "commission.hold_released",
    entityType: "storefront_commission_ledger",
    after: { row_ids: input.rowIds },
  });
}

// ─── Payout lifecycle (QB Bill) ───────────────────────────────────

export async function markCommissionsScheduled(input: {
  rowIds: string[];
  qbBillId: string;
  actorId?: string | null;
  tenantId: string;
}): Promise<void> {
  if (input.rowIds.length === 0) return;
  const { error } = await supabaseAdmin
    .from("storefront_commission_ledger")
    .update({
      status: "scheduled",
      scheduled_at: new Date().toISOString(),
      qb_bill_id: input.qbBillId,
    })
    .in("id", input.rowIds)
    .eq("status", "payable");
  if (error) throw error;
  await recordAuditEvent({
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: "payout.scheduled",
    entityType: "storefront_commission_ledger",
    after: { row_ids: input.rowIds, qb_bill_id: input.qbBillId },
  });
}

export async function markCommissionsPaid(input: {
  rowIds: string[];
  qbBillPaymentId: string;
  actorId?: string | null;
  tenantId: string;
}): Promise<void> {
  if (input.rowIds.length === 0) return;
  const { error } = await supabaseAdmin
    .from("storefront_commission_ledger")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      qb_bill_payment_id: input.qbBillPaymentId,
    })
    .in("id", input.rowIds)
    .eq("status", "scheduled");
  if (error) throw error;
  await recordAuditEvent({
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: "payout.sent",
    entityType: "storefront_commission_ledger",
    after: { row_ids: input.rowIds, qb_bill_payment_id: input.qbBillPaymentId },
  });
}

// ─── Balances view read-through ───────────────────────────────────

export interface TenantCommissionBalances {
  tenant_id: string;
  row_count: number;
  pending_rows: number;
  payable_rows: number;
  scheduled_rows: number;
  paid_rows: number;
  reversed_rows: number;
  pending_amount: number;
  payable_amount: number;
  scheduled_amount: number;
  paid_amount: number;
  reversed_amount: number;
  lifetime_net: number;
}

export async function getTenantBalances(tenantId: string): Promise<TenantCommissionBalances | null> {
  const { data } = await supabaseAdmin
    .from("storefront_commission_balances")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data as TenantCommissionBalances | null) ?? null;
}
