/**
 * Provider-specific ingest — reads a provider event and writes the canonical
 * ledger rows (invoices, payments, allocations) via paymentLedger.
 *
 * Each ingest function is non-fatal for the caller: if it throws or logs a
 * failure, the pre-existing downstream handlers still run. As we migrate more
 * business logic onto the ledger, downstream handlers can be simplified /
 * removed, but for Phase 1 both flows coexist.
 */

import type Stripe from "stripe";
import { supabaseAdmin } from "./supabaseAdmin";
import { getConnection, getAccountingApiBase } from "./quickbooks";
import { upsertInvoice, upsertPayment, recordRefund } from "./paymentLedger";

function toCents(amount: number | string | null | undefined): number {
  if (amount == null) return 0;
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

// ─── Stripe ──────────────────────────────────────────────────────────────

/**
 * Best-effort mapping from a Stripe event to (invoice + payment) rows.
 * We handle the events that currently drive money movement in this app —
 * checkout.session.completed + payment_intent.succeeded — and skip the rest
 * (subscription events, account.updated, etc.) since they don't create
 * customer-collection records.
 */
export async function ingestStripeEvent(event: Stripe.Event, eventRowId: string): Promise<void> {
  const t = event.type;

  if (t === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "subscription") return; // subs are handled separately
    if (session.payment_status !== "paid") return;

    const amount = session.amount_total ?? 0;
    const email = session.customer_email || session.customer_details?.email || null;
    const meta = (session.metadata || {}) as Record<string, string | null | undefined>;

    // Resolve linked entities from metadata that existing checkout endpoints
    // stamp on the session.
    const orderId = typeof meta.order_id === "string" ? meta.order_id : null;
    const agreementId = typeof meta.agreement_id === "string" ? meta.agreement_id : null;
    const leadId = typeof meta.lead_id === "string" ? meta.lead_id : (typeof meta.request_id === "string" ? meta.request_id : null);
    const buyerProfileId = typeof meta.user_id === "string" ? meta.user_id : null;

    // Create invoice keyed on the session id — one invoice per checkout.
    const invoice = await upsertInvoice({
      provider: "stripe",
      providerInvoiceId: session.id,
      providerInvoiceUrl: session.url || null,
      orderId,
      agreementId,
      leadId,
      buyerProfileId,
      buyerEmail: email,
      subtotalCents: amount,
      totalCents: amount,
      status: "paid",
      sentAt: new Date().toISOString(),
      metadata: { checkout_type: meta.type || null },
    });

    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

    await upsertPayment({
      provider: "stripe",
      providerPaymentId: paymentIntentId || session.id,
      eventId: eventRowId,
      invoiceId: invoice.id,
      orderId,
      agreementId,
      buyerProfileId,
      buyerEmail: email,
      amountCents: amount,
      method: "card",
      status: "paid",
      paidAt: new Date().toISOString(),
    });

    // Mirror the payment to any workflow linked to this order.
    if (orderId) {
      try {
        const { syncWorkflowFromSalesOrderPaid } = await import("./workflows/paymentSync");
        await syncWorkflowFromSalesOrderPaid({
          orderId,
          amountCents: amount,
          source: "stripe_webhook",
          changeKey: `stripe:${paymentIntentId || session.id}`,
        });
      } catch (e) {
        console.error("[paymentIngest] workflow payment sync failed:", e);
      }
    }
    return;
  }

  if (t === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const amount = pi.amount_received || pi.amount || 0;
    await upsertPayment({
      provider: "stripe",
      providerPaymentId: pi.id,
      eventId: eventRowId,
      buyerEmail: pi.receipt_email || null,
      amountCents: amount,
      method: pi.payment_method_types?.[0] || null,
      status: "paid",
      paidAt: new Date().toISOString(),
    });
    return;
  }

  if (t === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    // Cancel the invoice row if we had one — mirrors the expiration event.
    await supabaseAdmin
      .from("invoices")
      .update({ status: "void", voided_at: new Date().toISOString() })
      .eq("provider", "stripe")
      .eq("provider_invoice_id", session.id);
    return;
  }

  if (t === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const parentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (!parentIntentId) return;
    const { data: parent } = await supabaseAdmin
      .from("payments")
      .select("id, amount_cents, refund_of_payment_id")
      .eq("provider", "stripe")
      .eq("provider_payment_id", parentIntentId)
      .maybeSingle();
    if (!parent) return;

    // Iterate the actual refund objects on the charge — Stripe fires this
    // event once per new/updated refund. We upsert each by providerRefundId
    // via recordRefund's parent update logic (idempotent per event).
    for (const refund of charge.refunds?.data || []) {
      const alreadyRecorded = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("provider", "stripe")
        .eq("provider_payment_id", refund.id)
        .maybeSingle();
      if (alreadyRecorded.data) continue;

      await recordRefund({
        parentPaymentId: parent.id,
        provider: "stripe",
        providerRefundId: refund.id,
        eventId: eventRowId,
        amountCents: refund.amount,
        reason: refund.reason || "webhook_refund",
      });
    }
    return;
  }

  if (t === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
    if (!chargeId) return;
    const { data: parent } = await supabaseAdmin
      .from("payments")
      .select("id, status")
      .eq("provider", "stripe")
      .eq("provider_charge_id", chargeId)
      .maybeSingle();
    if (!parent) return;
    // Flip to disputed without recording a negative-amount row yet — that
    // happens if the dispute is lost (closed status = 'lost').
    await supabaseAdmin
      .from("payments")
      .update({ status: "disputed", disputed_at: new Date().toISOString() })
      .eq("id", parent.id);
    await supabaseAdmin.from("payment_status_history").insert({
      payment_id: parent.id,
      from_status: parent.status,
      to_status: "disputed",
      event_id: eventRowId,
      reason: `Stripe dispute opened: ${dispute.reason || "unknown"}`,
    });
    return;
  }

  if (t === "charge.dispute.closed") {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
    if (!chargeId) return;
    const { data: parent } = await supabaseAdmin
      .from("payments")
      .select("id, status, amount_cents")
      .eq("provider", "stripe")
      .eq("provider_charge_id", chargeId)
      .maybeSingle();
    if (!parent) return;

    if (dispute.status === "lost") {
      // Merchant lost — treat as chargeback: negative-amount row + parent
      // status flips to chargeback (paid → chargeback via recordRefund).
      await recordRefund({
        parentPaymentId: parent.id,
        provider: "stripe",
        providerRefundId: `dispute-${dispute.id}`,
        eventId: eventRowId,
        amountCents: dispute.amount,
        reason: `chargeback_lost: ${dispute.reason || ""}`,
        isChargeback: true,
      });
    } else if (dispute.status === "won" || dispute.status === "warning_closed") {
      // Merchant won — return the parent to paid so metrics recover.
      await supabaseAdmin
        .from("payments")
        .update({ status: "paid", disputed_at: null })
        .eq("id", parent.id);
      await supabaseAdmin.from("payment_status_history").insert({
        payment_id: parent.id,
        from_status: parent.status,
        to_status: "paid",
        event_id: eventRowId,
        reason: `Stripe dispute closed as ${dispute.status}`,
      });
    }
    return;
  }

  if (t === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    await upsertPayment({
      provider: "stripe",
      providerPaymentId: pi.id,
      eventId: eventRowId,
      buyerEmail: pi.receipt_email || null,
      amountCents: pi.amount || 0,
      method: pi.payment_method_types?.[0] || null,
      status: "failed",
      failedAt: new Date().toISOString(),
      failedReason: pi.last_payment_error?.message || pi.last_payment_error?.code || "unknown",
    });
    return;
  }
}

// ─── QuickBooks ──────────────────────────────────────────────────────────

/**
 * Fetches the QB Payment record, walks the LinkedTxn list to find the parent
 * Invoice, and writes ledger rows.
 */
export async function ingestQbPaymentEvent(
  paymentId: string,
  realmId: string,
  eventRowId: string | null,
): Promise<void> {
  const conn = await getConnection();
  if (conn.realm_id !== realmId) return;

  const base = getAccountingApiBase();

  const res = await fetch(`${base}/v3/company/${realmId}/payment/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return;
  const data = await res.json();
  const payment = data.Payment;
  if (!payment) return;

  const amountCents = toCents(payment.TotalAmt);
  const paidAt = payment.TxnDate ? new Date(payment.TxnDate).toISOString() : new Date().toISOString();

  // Walk linked invoices — most QB Payments carry a single invoice.
  const linkedInvoiceIds: string[] = [];
  for (const line of payment.Line || []) {
    for (const txn of line.LinkedTxn || []) {
      if (txn.TxnType === "Invoice") linkedInvoiceIds.push(String(txn.TxnId));
    }
  }

  const primaryInvoiceQbId = linkedInvoiceIds[0] || null;
  let invoiceRowId: string | null = null;

  if (primaryInvoiceQbId) {
    // If we already know this QB invoice, use it. Otherwise create a shell.
    const { data: existingInvoice } = await supabaseAdmin
      .from("invoices")
      .select("id, total_cents")
      .eq("provider", "quickbooks")
      .eq("provider_invoice_id", primaryInvoiceQbId)
      .maybeSingle();

    if (existingInvoice) {
      invoiceRowId = existingInvoice.id;
    } else {
      const created = await upsertInvoice({
        provider: "quickbooks",
        providerInvoiceId: primaryInvoiceQbId,
        buyerEmail: payment.CustomerRef?.name || null,
        subtotalCents: amountCents,
        totalCents: amountCents,
        status: "paid",
      });
      invoiceRowId = created.id;
    }
  }

  await upsertPayment({
    provider: "quickbooks",
    providerPaymentId: String(payment.Id),
    eventId: eventRowId,
    invoiceId: invoiceRowId,
    amountCents,
    method: payment.PaymentMethodRef?.name?.toLowerCase() || "unknown",
    status: "paid",
    paidAt,
  });
}
