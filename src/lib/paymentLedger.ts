/**
 * Payment ledger writer — provider-agnostic entry point that both the Stripe
 * and QuickBooks webhooks call. Every call is idempotent on (provider,
 * event_id) — a duplicate webhook delivery lands in payment_events but does
 * NOT double-write to payments or invoices.
 *
 * Contract:
 *   1. Call recordPaymentEvent(...) at the very top of each webhook handler,
 *      with the verified provider event body. Returns { eventRow, alreadyProcessed }.
 *   2. If alreadyProcessed → return early. All downstream side-effects already
 *      happened on the first delivery.
 *   3. Otherwise, resolve/create the Invoice + Payment via upsertInvoice +
 *      upsertPayment (or recordRefund for negative-amount events).
 *   4. Call markEventProcessed(eventRow.id) at the end. If anything throws
 *      in between, the event row stays unprocessed and a retry will re-run
 *      the handler cleanly.
 *
 * All amount fields use bigint cents to avoid float drift.
 */

import { supabaseAdmin } from "./supabaseAdmin";

export type PaymentProvider = "stripe" | "quickbooks" | "paypal" | "manual";

export type PaymentStatus =
  | "draft"
  | "pending"
  | "paid"
  | "partial_refund"
  | "refunded"
  | "failed"
  | "disputed"
  | "chargeback"
  | "cancelled"
  | "written_off";

export type InvoiceStatus =
  | "draft"
  | "open"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "void"
  | "written_off";

export interface RecordPaymentEventArgs {
  provider: PaymentProvider;
  eventId: string;
  eventType: string;
  signatureVerified: boolean;
  payload: Record<string, unknown> | unknown;
}

export interface PaymentEventRow {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  signature_verified: boolean;
  processed_at: string | null;
  received_at: string;
}

export interface RecordEventResult {
  event: PaymentEventRow;
  alreadyProcessed: boolean;
}

/**
 * Insert a payment_events row (or return the existing one for retries).
 * Returns alreadyProcessed=true if the same (provider, event_id) has already
 * been fully processed, in which case downstream side-effects should skip.
 */
export async function recordPaymentEvent(args: RecordPaymentEventArgs): Promise<RecordEventResult> {
  const { data: existing } = await supabaseAdmin
    .from("payment_events")
    .select("id, provider, event_id, event_type, signature_verified, processed_at, received_at")
    .eq("provider", args.provider)
    .eq("event_id", args.eventId)
    .maybeSingle();

  if (existing) {
    return { event: existing as PaymentEventRow, alreadyProcessed: !!existing.processed_at };
  }

  const { data: created, error } = await supabaseAdmin
    .from("payment_events")
    .insert({
      provider: args.provider,
      event_id: args.eventId,
      event_type: args.eventType,
      signature_verified: args.signatureVerified,
      payload: args.payload,
    })
    .select("id, provider, event_id, event_type, signature_verified, processed_at, received_at")
    .single();
  if (error) throw error;
  return { event: created as PaymentEventRow, alreadyProcessed: false };
}

export async function markEventProcessed(eventRowId: string, error?: string): Promise<void> {
  await supabaseAdmin
    .from("payment_events")
    .update({
      processed_at: new Date().toISOString(),
      processing_error: error || null,
    })
    .eq("id", eventRowId);
}

// ─── Invoice upsert ──────────────────────────────────────────────────────

export interface UpsertInvoiceArgs {
  provider: PaymentProvider;
  providerInvoiceId?: string | null;
  providerInvoiceUrl?: string | null;

  orderId?: string | null;
  agreementId?: string | null;
  accountId?: string | null;
  leadId?: string | null;
  buyerProfileId?: string | null;
  buyerEmail?: string | null;
  buyerName?: string | null;

  subtotalCents?: number;
  taxCents?: number;
  discountCents?: number;
  totalCents: number;
  currency?: string;

  status?: InvoiceStatus;
  dueDate?: string | null;
  sentAt?: string | null;

  memo?: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
}

export interface InvoiceRow {
  id: string;
  status: InvoiceStatus;
  total_cents: number;
  amount_paid_cents: number;
  balance_due_cents: number;
}

/**
 * Idempotent by (provider, provider_invoice_id) when providerInvoiceId is set.
 * When not set, always creates a new invoice — caller is responsible for its
 * own dedup logic.
 */
export async function upsertInvoice(args: UpsertInvoiceArgs): Promise<InvoiceRow> {
  const total = args.totalCents;
  const subtotal = args.subtotalCents ?? total;

  if (args.providerInvoiceId) {
    const { data: existing } = await supabaseAdmin
      .from("invoices")
      .select("id, status, total_cents, amount_paid_cents, balance_due_cents")
      .eq("provider", args.provider)
      .eq("provider_invoice_id", args.providerInvoiceId)
      .maybeSingle();
    if (existing) return existing as InvoiceRow;
  }

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .insert({
      provider: args.provider,
      provider_invoice_id: args.providerInvoiceId || null,
      provider_invoice_url: args.providerInvoiceUrl || null,
      order_id: args.orderId || null,
      agreement_id: args.agreementId || null,
      account_id: args.accountId || null,
      lead_id: args.leadId || null,
      buyer_profile_id: args.buyerProfileId || null,
      buyer_email: args.buyerEmail || null,
      buyer_name: args.buyerName || null,
      subtotal_cents: subtotal,
      tax_cents: args.taxCents ?? 0,
      discount_cents: args.discountCents ?? 0,
      total_cents: total,
      balance_due_cents: total,
      currency: args.currency || "USD",
      status: args.status || "open",
      due_date: args.dueDate || null,
      sent_at: args.sentAt || null,
      memo: args.memo || null,
      metadata: args.metadata || null,
      created_by: args.createdBy || null,
    })
    .select("id, status, total_cents, amount_paid_cents, balance_due_cents")
    .single();
  if (error) throw error;
  return data as InvoiceRow;
}

// ─── Payment upsert ──────────────────────────────────────────────────────

export interface UpsertPaymentArgs {
  provider: PaymentProvider;
  providerPaymentId?: string | null;
  providerChargeId?: string | null;
  eventId?: string | null;

  invoiceId?: string | null;
  orderId?: string | null;
  agreementId?: string | null;
  accountId?: string | null;
  buyerProfileId?: string | null;
  buyerEmail?: string | null;

  amountCents: number;              // positive for payments; use recordRefund for negatives
  currency?: string;
  method?: string | null;           // 'card' | 'ach' | ...
  last4?: string | null;

  status: PaymentStatus;
  paidAt?: string | null;
  failedAt?: string | null;
  failedReason?: string | null;

  providerFeeCents?: number;

  manualReference?: string | null;
  proofBucket?: string | null;
  proofPath?: string | null;
  proofUrl?: string | null;

  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
}

export interface PaymentRow {
  id: string;
  status: PaymentStatus;
  amount_cents: number;
  invoice_id: string | null;
}

/**
 * Idempotent by (provider, provider_payment_id). If a payment already exists
 * with the same provider payment id, we update the status/paid_at rather
 * than double-writing. Also writes a payment_status_history row on any
 * status change and, when linked to an invoice, updates the invoice's
 * amount_paid / balance / status atomically.
 */
export async function upsertPayment(args: UpsertPaymentArgs): Promise<PaymentRow> {
  let existing: PaymentRow | null = null;
  if (args.providerPaymentId) {
    const { data } = await supabaseAdmin
      .from("payments")
      .select("id, status, amount_cents, invoice_id")
      .eq("provider", args.provider)
      .eq("provider_payment_id", args.providerPaymentId)
      .maybeSingle();
    existing = (data as PaymentRow) || null;
  }

  const now = new Date().toISOString();

  if (existing) {
    // Update in place if status/paid_at is different. Don't clobber a paid
    // record back to pending.
    if (existing.status !== args.status) {
      await supabaseAdmin
        .from("payments")
        .update({
          status: args.status,
          paid_at: args.paidAt || null,
          failed_at: args.failedAt || null,
          failed_reason: args.failedReason || null,
          updated_at: now,
        })
        .eq("id", existing.id);

      await supabaseAdmin.from("payment_status_history").insert({
        payment_id: existing.id,
        from_status: existing.status,
        to_status: args.status,
        event_id: args.eventId || null,
      });

      if (existing.invoice_id) {
        await recomputeInvoiceTotals(existing.invoice_id);
      }

      // Newly-paid transition — fire commission earn hook.
      if (args.status === "paid" && existing.status !== "paid") {
        await maybeEarnCommissionsForPayment(existing.id, args.orderId ?? null, existing.invoice_id, args.amountCents, args.createdBy || null);
      }
    }
    return { ...existing, status: args.status };
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("payments")
    .insert({
      provider: args.provider,
      provider_payment_id: args.providerPaymentId || null,
      provider_charge_id: args.providerChargeId || null,
      event_id: args.eventId || null,
      invoice_id: args.invoiceId || null,
      order_id: args.orderId || null,
      agreement_id: args.agreementId || null,
      account_id: args.accountId || null,
      buyer_profile_id: args.buyerProfileId || null,
      buyer_email: args.buyerEmail || null,
      amount_cents: args.amountCents,
      currency: args.currency || "USD",
      method: args.method || null,
      last4: args.last4 || null,
      status: args.status,
      paid_at: args.paidAt || null,
      failed_at: args.failedAt || null,
      failed_reason: args.failedReason || null,
      provider_fee_cents: args.providerFeeCents ?? 0,
      manual_reference: args.manualReference || null,
      proof_bucket: args.proofBucket || null,
      proof_path: args.proofPath || null,
      proof_url: args.proofUrl || null,
      metadata: args.metadata || null,
      created_by: args.createdBy || null,
    })
    .select("id, status, amount_cents, invoice_id")
    .single();
  if (error) throw error;

  await supabaseAdmin.from("payment_status_history").insert({
    payment_id: inserted.id,
    from_status: null,
    to_status: args.status,
    event_id: args.eventId || null,
  });

  if (args.invoiceId && args.status === "paid") {
    await recomputeInvoiceTotals(args.invoiceId);
  }

  if (args.status === "paid") {
    await maybeEarnCommissionsForPayment(
      inserted.id,
      args.orderId ?? null,
      args.invoiceId ?? null,
      args.amountCents,
      args.createdBy || null,
    );
  }

  return inserted as PaymentRow;
}

/**
 * Bridge to the commissions module — kept out of the hot path via dynamic
 * import so a commissions failure never fails the payment write. Resolves the
 * effective order_id (using invoice.order_id if the payment row didn't carry
 * one) and then walks the attribution rows.
 */
async function maybeEarnCommissionsForPayment(
  paymentId: string,
  paymentOrderId: string | null,
  invoiceId: string | null,
  amountCents: number,
  actorId: string | null,
): Promise<void> {
  if (!(amountCents > 0)) return;
  try {
    let orderId = paymentOrderId;
    if (!orderId && invoiceId) {
      const { data: inv } = await supabaseAdmin
        .from("invoices")
        .select("order_id")
        .eq("id", invoiceId)
        .maybeSingle();
      orderId = inv?.order_id || null;
    }
    if (!orderId) return;

    const { earnCommissionsForPayment } = await import("./commissions");
    await earnCommissionsForPayment({
      orderId,
      paymentId,
      paymentAmountCents: amountCents,
      actorId,
    });
  } catch (e) {
    // Never fail the payment write on a commissions hiccup.
    console.error("[commissions] earn hook failed:", e);
  }
}

/**
 * Sums all paid + partial_refund payments against the invoice and updates
 * amount_paid / balance / status. Never touches history — that lives in
 * payment_status_history. Called on every payment status transition.
 */
export async function recomputeInvoiceTotals(invoiceId: string): Promise<void> {
  const { data: inv } = await supabaseAdmin
    .from("invoices")
    .select("id, total_cents, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return;

  const { data: pays } = await supabaseAdmin
    .from("payments")
    .select("amount_cents, status")
    .eq("invoice_id", invoiceId)
    .in("status", ["paid", "partial_refund", "refunded"]);

  const paid = (pays || []).reduce((sum, p) => {
    // paid contributes positively; refunded/partial_refund subtract via their
    // negative amount_cents (recordRefund writes negative rows).
    return sum + Number(p.amount_cents || 0);
  }, 0);

  const balance = Math.max(0, Number(inv.total_cents) - paid);
  let status: InvoiceStatus = inv.status as InvoiceStatus;
  if (balance <= 0 && Number(inv.total_cents) > 0) status = "paid";
  else if (paid > 0 && balance > 0) status = "partially_paid";
  else if (paid === 0 && (status === "paid" || status === "partially_paid")) status = "open";

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("invoices")
    .update({
      amount_paid_cents: paid,
      balance_due_cents: balance,
      status,
      paid_at: status === "paid" ? now : null,
      updated_at: now,
    })
    .eq("id", invoiceId);

  if (inv.status !== status) {
    await supabaseAdmin.from("payment_status_history").insert({
      invoice_id: invoiceId,
      from_status: inv.status,
      to_status: status,
    });
  }
}

// ─── Refunds / chargebacks ──────────────────────────────────────────────

export interface RecordRefundArgs {
  parentPaymentId: string;
  provider: PaymentProvider;
  providerRefundId?: string | null;
  eventId?: string | null;
  amountCents: number;               // positive input; stored negative
  reason?: string | null;
  isChargeback?: boolean;
  createdBy?: string | null;
}

export async function recordRefund(args: RecordRefundArgs): Promise<PaymentRow | null> {
  const { data: parent } = await supabaseAdmin
    .from("payments")
    .select("id, invoice_id, order_id, agreement_id, account_id, buyer_profile_id, buyer_email, method, amount_cents, status")
    .eq("id", args.parentPaymentId)
    .maybeSingle();
  if (!parent) return null;

  const negativeAmount = -Math.abs(args.amountCents);
  const nowIso = new Date().toISOString();

  const { data: refund, error } = await supabaseAdmin
    .from("payments")
    .insert({
      provider: args.provider,
      provider_payment_id: args.providerRefundId || null,
      event_id: args.eventId || null,
      invoice_id: parent.invoice_id,
      order_id: parent.order_id,
      agreement_id: parent.agreement_id,
      account_id: parent.account_id,
      buyer_profile_id: parent.buyer_profile_id,
      buyer_email: parent.buyer_email,
      method: parent.method,
      amount_cents: negativeAmount,
      status: args.isChargeback ? "chargeback" : "refunded",
      refund_of_payment_id: parent.id,
      refund_reason: args.reason || null,
      refunded_at: nowIso,
      created_by: args.createdBy || null,
    })
    .select("id, status, amount_cents, invoice_id")
    .single();
  if (error) throw error;

  // Move the parent from paid → partial_refund or refunded depending on the
  // proportion. Chargebacks always become 'chargeback'.
  const fullyRefunded = Math.abs(negativeAmount) >= Math.abs(Number(parent.amount_cents));
  const parentNewStatus: PaymentStatus = args.isChargeback
    ? "chargeback"
    : fullyRefunded
      ? "refunded"
      : "partial_refund";

  await supabaseAdmin
    .from("payments")
    .update({ status: parentNewStatus, refunded_at: nowIso, updated_at: nowIso })
    .eq("id", parent.id);

  await supabaseAdmin.from("payment_status_history").insert({
    payment_id: parent.id,
    from_status: parent.status,
    to_status: parentNewStatus,
    event_id: args.eventId || null,
    reason: args.reason || null,
  });

  if (parent.invoice_id) await recomputeInvoiceTotals(parent.invoice_id);

  // Commission auto-reverse — pro-rata against original earn rows.
  try {
    const { reverseCommissionsForRefund } = await import("./commissions");
    await reverseCommissionsForRefund({
      parentPaymentId: parent.id,
      refundPaymentId: (refund as PaymentRow).id,
      refundAmountCents: Math.abs(args.amountCents),
      reason: args.reason || null,
      isChargeback: !!args.isChargeback,
      actorId: args.createdBy || null,
    });
  } catch (e) {
    console.error("[commissions] reverse hook failed:", e);
  }

  return refund as PaymentRow;
}

// ─── Audit ─────────────────────────────────────────────────────────────

export interface AuditArgs {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export async function writeAuditLog(args: AuditArgs): Promise<void> {
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: args.actorId,
    action: args.action,
    entity_type: args.entityType,
    entity_id: args.entityId || null,
    reason: args.reason || null,
    before: args.before || null,
    after: args.after || null,
    metadata: args.metadata || null,
  });
}
