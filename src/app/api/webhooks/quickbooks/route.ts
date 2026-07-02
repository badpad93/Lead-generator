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
      if (entity.name === "Payment" && (entity.operation === "Create" || entity.operation === "Update")) {
        await handleQBPayment(entity.id, notification.realmId);
      }
      if (entity.name === "BillPayment" && (entity.operation === "Create" || entity.operation === "Update")) {
        await handleQBBillPayment(entity.id, notification.realmId);
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
      .select("id, status")
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
