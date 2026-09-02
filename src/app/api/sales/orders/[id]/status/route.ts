import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { sendOrderReceipt } from "@/lib/sendOrderReceipt";
import { upsertPayment } from "@/lib/paymentLedger";

const STATUS_ACTIONS: Record<string, { order_status?: string; payment_status?: string; invoice_status?: string; agreement_status?: string; fulfillment_status?: string; next_action?: string | null }> = {
  send_invoice: { invoice_status: "sent", order_status: "invoice_sent", next_action: "Follow up on payment" },
  send_agreement: { agreement_status: "sent", order_status: "agreement_sent", next_action: "Follow up on signature" },
  mark_agreement_signed: { agreement_status: "signed", order_status: "awaiting_payment", next_action: "Confirm payment" },
  mark_deposit_paid: { payment_status: "deposit_paid", order_status: "deposit_paid", next_action: "Collect remaining balance" },
  mark_paid: { payment_status: "paid", order_status: "paid", next_action: "Order machine from supplier" },
  mark_machine_ordered: { fulfillment_status: "ordered", order_status: "machine_ordered", next_action: "Schedule shipment" },
  mark_location_search: { fulfillment_status: "location_search", order_status: "location_search_active", next_action: "Find and confirm location" },
  mark_coffee_setup: { fulfillment_status: "coffee_setup", order_status: "coffee_program_setup", next_action: "Complete coffee program setup" },
  mark_shipped: { fulfillment_status: "shipped", order_status: "shipped", next_action: "Confirm delivery" },
  mark_delivered: { fulfillment_status: "delivered", order_status: "delivered", next_action: "Mark completed" },
  mark_completed: { fulfillment_status: "completed", order_status: "completed", next_action: null },
  mark_cancelled: { order_status: "cancelled", fulfillment_status: "cancelled", next_action: null },
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  let { action } = body as { action: string };

  if (!STATUS_ACTIONS[action]) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Location-services orders are deposit-only — the placement fee is
  // billed separately per placement, not on this order. So a
  // "mark_deposit_paid" click on a location_services order should
  // behave as if the whole order is paid: no "Collect remaining
  // balance" next action, no deposit-style receipt implying a
  // balance is owed. Promote the action before the status write.
  if (action === "mark_deposit_paid") {
    const { data: orderPeek } = await supabaseAdmin
      .from("sales_orders")
      .select("order_type")
      .eq("id", id)
      .maybeSingle();
    if (orderPeek?.order_type === "location_services") {
      action = "mark_paid";
    }
  }
  const statusUpdate = STATUS_ACTIONS[action];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (statusUpdate.order_status) updates.order_status = statusUpdate.order_status;
  if (statusUpdate.payment_status) updates.payment_status = statusUpdate.payment_status;
  if (statusUpdate.invoice_status) updates.invoice_status = statusUpdate.invoice_status;
  if (statusUpdate.agreement_status) updates.agreement_status = statusUpdate.agreement_status;
  if (statusUpdate.fulfillment_status) updates.fulfillment_status = statusUpdate.fulfillment_status;
  if (statusUpdate.next_action !== undefined) updates.next_required_action = statusUpdate.next_action;

  if (action === "mark_deposit_paid") {
    updates.deposit_paid = true;
  }

  // Agreement-before-order lifecycle: for coffee / 10-10-10 sales the
  // quote → agreement → signed → order path skips the manual
  // "Convert to Order" click. When a rep marks the agreement signed
  // on a row that's still a quote, flip document_type='order' in the
  // same write so the CRM immediately reflects reality (and the
  // Next Step button jumps straight to "Send Invoice").
  let didFlipQuoteToOrder = false;
  let flipOrderNumber: string | null = null;
  if (action === "mark_agreement_signed") {
    const { data: orderPeek } = await supabaseAdmin
      .from("sales_orders")
      .select("document_type, order_number")
      .eq("id", id)
      .maybeSingle();
    if (orderPeek?.document_type === "quote") {
      updates.document_type = "order";
      didFlipQuoteToOrder = true;
      flipOrderNumber = (orderPeek as { order_number?: string | null }).order_number ?? null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("sales_orders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const description = action.replace(/_/g, " ").replace(/^mark /, "Marked ").replace(/^send /, "Sent ");
  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "status_change",
    description: description.charAt(0).toUpperCase() + description.slice(1),
  });

  if (didFlipQuoteToOrder) {
    await supabaseAdmin.from("order_activity_log").insert({
      order_id: id,
      user_id: user.id,
      activity_type: "quote_converted_to_order",
      description: `Quote ${flipOrderNumber ?? id.slice(0, 8)} converted to order (agreement signed)`,
    });
  }

  // Auto-send the customer invoice the moment the agreement is
  // marked signed, reflecting the amounts on the agreement itself.
  // Rep no longer clicks Send Invoice as a separate step for the
  // CRM signing flow — signing is the payment trigger. Idempotent
  // via invoice_status; if a prior invoice was already sent, this
  // is a no-op. Non-fatal — status update already succeeded, so a
  // failing invoice send lands in the activity log and the rep
  // can retry via the Send Invoice button.
  if (action === "mark_agreement_signed") {
    try {
      const { data: linkedAgreement } = await supabaseAdmin
        .from("purchase_agreements")
        .select("id")
        .eq("order_id", id)
        .eq("agreement_status", "signed")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (linkedAgreement?.id) {
        const { sendInvoiceForSignedAgreement } = await import(
          "@/lib/agreementInvoicing"
        );
        const result = await sendInvoiceForSignedAgreement(linkedAgreement.id);
        if (!result.ok) {
          await supabaseAdmin.from("order_activity_log").insert({
            order_id: id,
            user_id: user.id,
            activity_type: "invoice_auto_send_failed",
            description: `Auto-invoice on signing failed: ${result.reason ?? "unknown"}`,
          });
        }
      }
    } catch (invoiceErr) {
      console.error("[status.mark_agreement_signed] auto-invoice failed:", invoiceErr);
      await supabaseAdmin.from("order_activity_log").insert({
        order_id: id,
        user_id: user.id,
        activity_type: "invoice_auto_send_failed",
        description: `Auto-invoice on signing threw: ${invoiceErr instanceof Error ? invoiceErr.message : String(invoiceErr)}`,
      });
    }
  }

  // Financial spine — write a manual payment row so this collection flows
  // through the ledger and fires the commission auto-earn hook. Non-fatal:
  // if the ledger write fails we still let the receipt + status update
  // proceed (same policy as the paymentLedger auto-hooks themselves).
  if (action === "mark_paid" || action === "mark_deposit_paid") {
    try {
      const orderRow = data as {
        id: string;
        total_value?: number | string | null;
        deposit_amount?: number | string | null;
        qb_invoice_id?: string | null;
        assigned_rep_id?: string | null;
        created_by?: string | null;
        account_id?: string | null;
        contact_email?: string | null;
      };
      const totalValue = Number(orderRow.total_value || 0);
      const depositValue = Number(orderRow.deposit_amount || 0);
      const amountCents = action === "mark_deposit_paid"
        ? Math.round(depositValue * 100)
        : Math.max(0, Math.round((totalValue - depositValue) * 100));

      if (amountCents > 0) {
        // Idempotency guard: don't double-book if the same button is
        // clicked twice. Manual-provider ids embed the action so deposit
        // and remaining are distinct writes.
        const manualPaymentId = `manual:sales_order:${orderRow.id}:${action}`;
        await upsertPayment({
          provider: "manual",
          providerPaymentId: manualPaymentId,
          orderId: orderRow.id,
          buyerEmail: orderRow.contact_email || null,
          accountId: orderRow.account_id || null,
          amountCents,
          method: body.payment_method || "manual",
          status: "paid",
          paidAt: new Date().toISOString(),
          manualReference: body.payment_reference || null,
          metadata: {
            source: "sales_orders.status",
            action,
            qb_invoice_id: orderRow.qb_invoice_id || null,
          },
          createdBy: user.id,
        });
      }
    } catch (ledgerErr) {
      console.error("[status] ledger write failed (non-fatal):", ledgerErr);
    }
  }

  // Workflow sync — mirror payment onto the linked workflow, and
  // spawn a location_services workflow if this was a paid intake
  // deposit that hadn't materialized one yet. The QB webhook fires
  // this same helper; adding it here so manual "mark paid" clicks
  // don't leave orphans. Non-fatal — status update already
  // succeeded whether or not the workflow sync completes.
  if (action === "mark_paid" || action === "mark_deposit_paid") {
    try {
      const { syncWorkflowFromSalesOrderPaid } = await import("@/lib/workflows/paymentSync");
      await syncWorkflowFromSalesOrderPaid({
        orderId: id,
        source: "manual_mark_paid",
        changeKey: `manual:sales_order:${id}:${action}`,
      });
    } catch (workflowErr) {
      console.error("[status] workflow sync failed (non-fatal):", workflowErr);
    }
  }

  // Auto-send customer receipt when a payment is marked
  if (action === "mark_paid" || action === "mark_deposit_paid") {
    const paymentType: "deposit" | "full" = action === "mark_deposit_paid" ? "deposit" : "full";
    const alreadySentField = paymentType === "deposit"
      ? (data as { deposit_receipt_status?: string }).deposit_receipt_status
      : (data as { receipt_status?: string }).receipt_status;

    if (alreadySentField !== "sent") {
      try {
        const result = await sendOrderReceipt({
          orderId: id,
          paymentType,
          paymentMethod: body.payment_method || null,
          paymentReference: body.payment_reference || null,
          userId: user.id,
        });
        if (!result.ok) {
          await supabaseAdmin.from("order_activity_log").insert({
            order_id: id,
            user_id: user.id,
            activity_type: "receipt_failed",
            description: `Auto-receipt failed: ${result.error || "unknown"}`,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabaseAdmin.from("order_activity_log").insert({
          order_id: id,
          user_id: user.id,
          activity_type: "receipt_failed",
          description: `Auto-receipt failed: ${msg}`,
        });
      }
    }
  }

  // Mirror the payment onto any workflow linked to this order.
  if (action === "mark_paid") {
    try {
      const { syncWorkflowFromSalesOrderPaid } = await import("@/lib/workflows/paymentSync");
      await syncWorkflowFromSalesOrderPaid({
        orderId: id,
        source: "sales_orders.status",
        changeKey: `manual:sales_order:${id}:mark_paid`,
      });
    } catch (e) {
      console.error("[orders.status] workflow payment sync failed:", e);
    }
  }

  return NextResponse.json(data);
}
