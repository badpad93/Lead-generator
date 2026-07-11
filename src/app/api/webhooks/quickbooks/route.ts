import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/quickbooks";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  handleLeadPurchaseCompleted,
  handleAgreementPaymentCompleted,
  handleMachinePurchaseCompleted,
  handleCoffeeOrderCompleted,
  handleMarketplacePurchaseCompleted,
} from "@/lib/paymentHandlers";
import { recordPaymentEvent, markEventProcessed } from "@/lib/paymentLedger";
import { ingestQbPaymentEvent } from "@/lib/paymentIngest";

interface QBWebhookEvent {
  eventNotifications: {
    realmId: string;
    dataChangeEvent: {
      entities: {
        name: string; // "Payment", "Invoice", etc.
        id: string;
        operation: string; // "Create", "Update", "Delete"
        lastUpdated: string;
      }[];
    };
  }[];
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("intuit-signature") || "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("[qb-webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: QBWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  for (const notification of event.eventNotifications || []) {
    for (const entity of notification.dataChangeEvent?.entities || []) {
      // Financial spine — one event_id per entity update. Re-delivery of the
      // same batch produces the same event_id + skips already-processed rows.
      const eventId = `qb:${notification.realmId}:${entity.name}:${entity.id}:${entity.lastUpdated}`;
      let ledgerEventRowId: string | null = null;
      try {
        const { event: eventRow, alreadyProcessed } = await recordPaymentEvent({
          provider: "quickbooks",
          eventId,
          eventType: `${entity.name}.${entity.operation}`,
          signatureVerified: true,
          payload: { entity, realmId: notification.realmId },
        });
        if (alreadyProcessed) continue;
        ledgerEventRowId = eventRow.id;
      } catch (logErr) {
        console.error("[qb-webhook] event log write failed (proceeding):", logErr);
      }

      try {
        if (entity.name === "Payment" && (entity.operation === "Create" || entity.operation === "Update")) {
          // Ledger ingest first (non-fatal), then existing downstream handler.
          try {
            await ingestQbPaymentEvent(entity.id, notification.realmId, ledgerEventRowId);
          } catch (ingestErr) {
            console.error("[qb-webhook] ledger ingest failed (non-fatal):", ingestErr);
          }
          await handleQBPayment(entity.id, notification.realmId);
        }
        if (entity.name === "BillPayment" && (entity.operation === "Create" || entity.operation === "Update")) {
          await handleQBBillPayment(entity.id, notification.realmId);
        }
        if (entity.name === "RefundReceipt" && (entity.operation === "Create" || entity.operation === "Update")) {
          await handleQBRefundReceipt(entity.id, notification.realmId);
        }
        if (entity.name === "CreditMemo" && (entity.operation === "Create" || entity.operation === "Update")) {
          await handleQBCreditMemo(entity.id, notification.realmId);
        }
      } finally {
        if (ledgerEventRowId) {
          await markEventProcessed(ledgerEventRowId).catch(() => undefined);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleQBBillPayment(billPaymentId: string, realmId: string) {
  const { getConnection } = await import("@/lib/quickbooks");
  const conn = await getConnection();
  if (conn.realm_id !== realmId) return;

  const base = process.env.QB_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

  const res = await fetch(`${base}/v3/company/${realmId}/billpayment/${billPaymentId}`, {
    headers: { Authorization: `Bearer ${conn.access_token}`, Accept: "application/json" },
  });
  if (!res.ok) return;

  const data = await res.json();
  const billIds: string[] = [];
  for (const line of data.BillPayment?.Line || []) {
    for (const txn of line.LinkedTxn || []) {
      if (txn.TxnType === "Bill") billIds.push(txn.TxnId);
    }
  }

  for (const billId of billIds) {
    const { data: payout } = await supabaseAdmin
      .from("marketplace_payouts")
      .select("id, status")
      .eq("qb_bill_id", billId)
      .maybeSingle();
    if (payout && payout.status !== "paid") {
      await supabaseAdmin
        .from("marketplace_payouts")
        .update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", payout.id);
    }
  }
}

async function handleQBPayment(paymentId: string, realmId: string) {
  // Fetch payment details from QB
  const { getConnection } = await import("@/lib/quickbooks");
  const conn = await getConnection();

  if (conn.realm_id !== realmId) {
    console.error(`[qb-webhook] Realm mismatch: expected ${conn.realm_id}, got ${realmId}`);
    return;
  }

  const base = process.env.QB_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

  const res = await fetch(`${base}/v3/company/${realmId}/payment/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    console.error(`[qb-webhook] Failed to fetch payment ${paymentId}:`, await res.text());
    return;
  }

  const data = await res.json();
  const payment = data.Payment;

  // Find which invoice(s) this payment is for
  const invoiceIds: string[] = [];
  for (const line of payment.Line || []) {
    for (const txn of line.LinkedTxn || []) {
      if (txn.TxnType === "Invoice") {
        invoiceIds.push(txn.TxnId);
      }
    }
  }

  if (invoiceIds.length === 0) {
    console.log(`[qb-webhook] Payment ${paymentId} not linked to any invoice, skipping`);
    return;
  }

  for (const invoiceId of invoiceIds) {
    // Look up the invoice in our metadata to determine what type of payment this is
    // We store the QB invoice ID in the relevant table when creating the invoice

    // Check sales_orders (CRM main invoice, remaining-balance invoice, and
    // apex placement fee invoice all live on this table).
    const { data: salesOrder } = await supabaseAdmin
      .from("sales_orders")
      .select("id, qb_invoice_id, location_remaining_qb_invoice_id, order_status, payment_status")
      .or(`qb_invoice_id.eq.${invoiceId},location_remaining_qb_invoice_id.eq.${invoiceId}`)
      .maybeSingle();

    if (salesOrder) {
      console.log(`[qb-webhook] Processing sales_orders payment for invoice ${invoiceId}`);
      const isRemaining = salesOrder.location_remaining_qb_invoice_id === invoiceId;
      const patch: Record<string, unknown> = {
        payment_status: "paid",
        updated_at: new Date().toISOString(),
      };
      if (!isRemaining) patch.order_status = "paid";
      await supabaseAdmin.from("sales_orders").update(patch).eq("id", salesOrder.id);
      await supabaseAdmin.from("order_activity_log").insert({
        order_id: salesOrder.id,
        activity_type: "payment_received",
        description: `QuickBooks payment received on invoice ${invoiceId}${isRemaining ? " (remaining balance)" : ""}`,
      });
      await stampOrderAndEarnCommissions(paymentId, salesOrder.id, null);
      continue;
    }

    // Check purchase_agreements (apex_placement_qb_invoice_id — sales-side
    // placement fee invoice attached to a signed agreement).
    const { data: apexAgreement } = await supabaseAdmin
      .from("purchase_agreements")
      .select("id, order_id")
      .eq("apex_placement_qb_invoice_id", invoiceId)
      .maybeSingle();

    if (apexAgreement) {
      console.log(`[qb-webhook] Processing apex placement invoice payment for QB invoice ${invoiceId}`);
      await supabaseAdmin
        .from("purchase_agreements")
        .update({ apex_placement_paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", apexAgreement.id);
      if (apexAgreement.order_id) {
        await stampOrderAndEarnCommissions(paymentId, apexAgreement.order_id, apexAgreement.id);
      }
      continue;
    }

    // Check agreement_tokens
    const { data: agreement } = await supabaseAdmin
      .from("agreement_tokens")
      .select("id, pipeline_item_id, step_id")
      .eq("qb_invoice_id", invoiceId)
      .maybeSingle();

    if (agreement) {
      console.log(`[qb-webhook] Processing agreement payment for invoice ${invoiceId}`);
      await handleAgreementPaymentCompleted({
        agreementTokenId: agreement.id,
        pipelineItemId: agreement.pipeline_item_id,
        stepId: agreement.step_id,
        paymentId: `qb_${paymentId}`,
      });

      await supabaseAdmin
        .from("agreement_tokens")
        .update({ qb_payment_id: paymentId })
        .eq("id", agreement.id);
      continue;
    }

    // Check lead_purchases
    const { data: leadPurchase } = await supabaseAdmin
      .from("lead_purchases")
      .select("id, user_id, request_id, buyer_email")
      .eq("qb_invoice_id", invoiceId)
      .maybeSingle();

    if (leadPurchase) {
      console.log(`[qb-webhook] Processing lead purchase payment for invoice ${invoiceId}`);
      // Fetch the agreement_id from signed_agreements
      const { data: signedAgreement } = await supabaseAdmin
        .from("signed_agreements")
        .select("id")
        .eq("user_id", leadPurchase.user_id)
        .eq("lead_id", leadPurchase.request_id)
        .maybeSingle();

      await handleLeadPurchaseCompleted({
        sessionId: invoiceId,
        userId: leadPurchase.user_id,
        requestId: leadPurchase.request_id,
        agreementId: signedAgreement?.id,
        buyerEmail: leadPurchase.buyer_email,
        paymentId: `qb_${paymentId}`,
      });

      await supabaseAdmin
        .from("lead_purchases")
        .update({ qb_payment_id: paymentId })
        .eq("id", leadPurchase.id);
      continue;
    }

    // Check machine_listing_purchases
    const { data: machinePurchase } = await supabaseAdmin
      .from("machine_listing_purchases")
      .select("id, machine_listing_id")
      .eq("qb_invoice_id", invoiceId)
      .maybeSingle();

    if (machinePurchase) {
      console.log(`[qb-webhook] Processing machine purchase payment for invoice ${invoiceId}`);
      await handleMachinePurchaseCompleted({
        purchaseId: machinePurchase.id,
        listingId: machinePurchase.machine_listing_id,
        paymentId: `qb_${paymentId}`,
      });

      await supabaseAdmin
        .from("machine_listing_purchases")
        .update({ qb_payment_id: paymentId })
        .eq("id", machinePurchase.id);
      continue;
    }

    // Check coffee_orders
    const { data: coffeeOrder } = await supabaseAdmin
      .from("coffee_orders")
      .select("id, operator_id")
      .eq("qb_invoice_id", invoiceId)
      .maybeSingle();

    if (coffeeOrder) {
      console.log(`[qb-webhook] Processing coffee order payment for invoice ${invoiceId}`);
      await handleCoffeeOrderCompleted({
        orderId: coffeeOrder.id,
        userId: coffeeOrder.operator_id,
        paymentId: `qb_${paymentId}`,
      });

      await supabaseAdmin
        .from("coffee_orders")
        .update({ qb_payment_id: paymentId })
        .eq("id", coffeeOrder.id);
      continue;
    }

    // Check lead_generator_subscriptions — QB invoice acts as the
    // recurring "period charge". On payment we advance the current
    // period + activate the entitlement. Idempotent per (invoiceId, paymentId).
    const { data: lgSub } = await supabaseAdmin
      .from("lead_generator_subscriptions")
      .select("id, user_id")
      .eq("provider_subscription_id", invoiceId)
      .maybeSingle();

    if (lgSub) {
      console.log(`[qb-webhook] Processing lead-generator subscription payment for QB invoice ${invoiceId}`);
      const { handleInvoicePaid } = await import("@/lib/leadGeneratorSubscription");
      await handleInvoicePaid({ invoiceId, paymentId: `qb_${paymentId}` });
      continue;
    }

    // Check user_listing_purchases (marketplace)
    const { data: marketplacePurchase } = await supabaseAdmin
      .from("user_listing_purchases")
      .select("id, listing_id, buyer_id, seller_id")
      .eq("qb_invoice_id", invoiceId)
      .maybeSingle();

    if (marketplacePurchase) {
      console.log(`[qb-webhook] Processing marketplace purchase payment for invoice ${invoiceId}`);
      await handleMarketplacePurchaseCompleted({
        sessionId: invoiceId,
        listingId: marketplacePurchase.listing_id,
        buyerId: marketplacePurchase.buyer_id,
        sellerId: marketplacePurchase.seller_id,
        paymentId: `qb_${paymentId}`,
        buyerEmail: null,
      });

      await supabaseAdmin
        .from("user_listing_purchases")
        .update({ qb_payment_id: paymentId })
        .eq("id", marketplacePurchase.id);
      continue;
    }

    // Check pipeline_payments
    const { data: pipelinePayment } = await supabaseAdmin
      .from("pipeline_payments")
      .select("id")
      .eq("qb_invoice_id", invoiceId)
      .maybeSingle();

    if (pipelinePayment) {
      console.log(`[qb-webhook] Processing pipeline payment for invoice ${invoiceId}`);
      await supabaseAdmin
        .from("pipeline_payments")
        .update({
          status: "completed",
          qb_payment_id: paymentId,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pipelinePayment.id);
      continue;
    }

    // Check marketplace_operator_invoices (Phase 2.4 — placement fee billing)
    const { data: marketplaceOpInvoice } = await supabaseAdmin
      .from("marketplace_operator_invoices")
      .select("id, status, submission_id")
      .eq("qb_invoice_id", invoiceId)
      .maybeSingle();

    if (marketplaceOpInvoice) {
      console.log(`[qb-webhook] Processing marketplace operator invoice payment for QB invoice ${invoiceId}`);
      if (marketplaceOpInvoice.status !== "paid") {
        await supabaseAdmin
          .from("marketplace_operator_invoices")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", marketplaceOpInvoice.id);

        // Release the paired PP payout — drop it from awaiting_collection to
        // queued so the QB Bill drain picks it up. Then push immediately in
        // the background so the partner sees their money moving quickly.
        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from("marketplace_payouts")
          .update({ status: "queued", updated_at: nowIso })
          .eq("submission_id", marketplaceOpInvoice.submission_id)
          .eq("status", "awaiting_collection");
        try {
          const { data: payout } = await supabaseAdmin
            .from("marketplace_payouts")
            .select("id, status")
            .eq("submission_id", marketplaceOpInvoice.submission_id)
            .maybeSingle();
          if (payout && payout.status === "queued") {
            const { pushPayoutToQb } = await import("@/lib/marketplaceQb");
            pushPayoutToQb(payout.id).catch(() => undefined);
          }
        } catch { /* non-critical */ }
      }
      continue;
    }

    // Check sales_leads (location services deposit)
    const { data: depositLead } = await supabaseAdmin
      .from("sales_leads")
      .select("id")
      .eq("qb_invoice_id", invoiceId)
      .maybeSingle();

    if (depositLead) {
      console.log(`[qb-webhook] Processing location services deposit for invoice ${invoiceId}`);
      await supabaseAdmin
        .from("sales_leads")
        .update({
          deposit_status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", depositLead.id);
      continue;
    }

    console.log(`[qb-webhook] No matching record found for invoice ${invoiceId}`);
  }
}

/**
 * Stamp order_id on the ledger's payments/invoices rows AFTER we've resolved
 * the CRM linkage, and fire the commission earn hook. `ingestQbPaymentEvent`
 * ran before this with a null order_id and returned early — we call the earn
 * function directly here now that we know the order. Idempotent per
 * (order, payment, user, role) so a double-fire is harmless.
 */
async function stampOrderAndEarnCommissions(
  paymentId: string,
  orderId: string,
  agreementId: string | null,
): Promise<void> {
  // Update payments row + invoice row so any downstream summary math sees
  // the linkage.
  const { data: paymentRow } = await supabaseAdmin
    .from("payments")
    .update({
      order_id: orderId,
      agreement_id: agreementId,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "quickbooks")
    .eq("provider_payment_id", paymentId)
    .select("id, amount_cents, invoice_id, status")
    .maybeSingle();

  if (paymentRow?.invoice_id) {
    await supabaseAdmin
      .from("invoices")
      .update({ order_id: orderId, agreement_id: agreementId, updated_at: new Date().toISOString() })
      .eq("id", paymentRow.invoice_id);
  }

  if (!paymentRow || paymentRow.status !== "paid") return;

  try {
    const { earnCommissionsForPayment } = await import("@/lib/commissions");
    await earnCommissionsForPayment({
      orderId,
      paymentId: paymentRow.id,
      paymentAmountCents: Number(paymentRow.amount_cents || 0),
      actorId: null,
    });
  } catch (e) {
    console.error("[qb-webhook] commissions earn failed (non-fatal):", e);
  }
}

// ─── Refund / credit memo handlers ──────────────────────────────────────
// QuickBooks refund flows: RefundReceipt (cash refund to customer) and
// CreditMemo (issued credit — may or may not have been applied to an
// invoice). Both need to fire recordRefund on the parent payment so the
// commission auto-reverse hook runs.

async function handleQBRefundReceipt(refundReceiptId: string, realmId: string) {
  const { getConnection } = await import("@/lib/quickbooks");
  const conn = await getConnection();
  if (conn.realm_id !== realmId) return;

  const base = process.env.QB_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

  const res = await fetch(`${base}/v3/company/${realmId}/refundreceipt/${refundReceiptId}`, {
    headers: { Authorization: `Bearer ${conn.access_token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    console.error(`[qb-webhook] Failed to fetch RefundReceipt ${refundReceiptId}`);
    return;
  }
  const data = await res.json();
  const rr = data.RefundReceipt;
  if (!rr) return;

  // A RefundReceipt's LinkedTxn usually points at the original SalesReceipt
  // or Invoice. Walk that link to find the parent payment.
  const linkedInvoiceIds: string[] = [];
  for (const line of rr.Line || []) {
    for (const txn of line.LinkedTxn || []) {
      if (txn.TxnType === "Invoice") linkedInvoiceIds.push(String(txn.TxnId));
      if (txn.TxnType === "Payment") {
        // Direct payment link — resolve to our payments row and refund it.
        const { data: parent } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("provider", "quickbooks")
          .eq("provider_payment_id", String(txn.TxnId))
          .maybeSingle();
        if (parent) {
          const { recordRefund } = await import("@/lib/paymentLedger");
          await recordRefund({
            parentPaymentId: parent.id,
            provider: "quickbooks",
            providerRefundId: refundReceiptId,
            amountCents: Math.round(Number(rr.TotalAmt || 0) * 100),
            reason: rr.PrivateNote || "QuickBooks RefundReceipt",
          });
          return;
        }
      }
    }
  }

  // Fall back to invoice → payment lookup
  for (const qbInvoiceId of linkedInvoiceIds) {
    const { data: invoiceRow } = await supabaseAdmin
      .from("invoices")
      .select("id")
      .eq("provider", "quickbooks")
      .eq("provider_invoice_id", qbInvoiceId)
      .maybeSingle();
    if (!invoiceRow) continue;
    const { data: parent } = await supabaseAdmin
      .from("payments")
      .select("id, amount_cents")
      .eq("invoice_id", invoiceRow.id)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (!parent) continue;
    const { recordRefund } = await import("@/lib/paymentLedger");
    await recordRefund({
      parentPaymentId: parent.id,
      provider: "quickbooks",
      providerRefundId: refundReceiptId,
      amountCents: Math.round(Number(rr.TotalAmt || 0) * 100),
      reason: rr.PrivateNote || "QuickBooks RefundReceipt",
    });
    return;
  }

  console.log(`[qb-webhook] RefundReceipt ${refundReceiptId} — no matching payment/invoice`);
}

async function handleQBCreditMemo(creditMemoId: string, realmId: string) {
  const { getConnection } = await import("@/lib/quickbooks");
  const conn = await getConnection();
  if (conn.realm_id !== realmId) return;

  const base = process.env.QB_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

  const res = await fetch(`${base}/v3/company/${realmId}/creditmemo/${creditMemoId}`, {
    headers: { Authorization: `Bearer ${conn.access_token}`, Accept: "application/json" },
  });
  if (!res.ok) return;
  const data = await res.json();
  const cm = data.CreditMemo;
  if (!cm) return;

  // A CreditMemo applied to an invoice reduces that invoice's balance. If
  // the invoice was already paid in full, treat this as a refund of that
  // payment. Otherwise write it as an audit-only event; the reduced balance
  // will show up when recomputeInvoiceTotals next runs.
  const linkedInvoiceIds: string[] = [];
  for (const line of cm.Line || []) {
    for (const txn of line.LinkedTxn || []) {
      if (txn.TxnType === "Invoice") linkedInvoiceIds.push(String(txn.TxnId));
    }
  }

  for (const qbInvoiceId of linkedInvoiceIds) {
    const { data: invoiceRow } = await supabaseAdmin
      .from("invoices")
      .select("id, status, total_cents, amount_paid_cents")
      .eq("provider", "quickbooks")
      .eq("provider_invoice_id", qbInvoiceId)
      .maybeSingle();
    if (!invoiceRow) continue;

    // Only reverse the parent payment if this credit memo actually cancels
    // collected money (invoice was paid). Credit issued against an open
    // invoice just lowers the balance and doesn't touch commissions.
    if (invoiceRow.status !== "paid" || Number(invoiceRow.amount_paid_cents) === 0) continue;

    const { data: parent } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("invoice_id", invoiceRow.id)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (!parent) continue;

    const { recordRefund } = await import("@/lib/paymentLedger");
    await recordRefund({
      parentPaymentId: parent.id,
      provider: "quickbooks",
      providerRefundId: `credit_memo_${creditMemoId}`,
      amountCents: Math.round(Number(cm.TotalAmt || 0) * 100),
      reason: cm.PrivateNote || "QuickBooks CreditMemo",
    });
    return;
  }
}
