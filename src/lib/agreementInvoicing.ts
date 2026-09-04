/**
 * Send the QuickBooks invoice for an existing sales_order at the
 * moment its purchase agreement is marked signed.
 *
 * The pre-existing autoCreateOrderAndSendInvoice() path in
 * generateAgreementPdf.ts covers the e-sign flow: a customer signs
 * via the token URL, we auto-create the sales_order AND send the
 * invoice as one step, gated on the auto_send_invoice_on_signing
 * toggle and only firing when the agreement has no linked order.
 *
 * This helper covers the OTHER path: a rep in the CRM clicks
 * "Mark Agreement Signed" on an order that already exists
 * (the agreement was generated from the order, agreement.order_id
 * points back). The invoice was not auto-firing for that flow —
 * the rep had to click Send Invoice as a separate step. Product
 * ask: when an agreement is signed, the customer should
 * automatically receive the invoice that reflects the agreement
 * cost.
 *
 * The invoice reflects the AGREEMENT'S totals (equipment_subtotal,
 * freight_total, locations_purchased * location_fee_per_secured,
 * accounting for section toggles and deposit-only mode) rather
 * than the sales_order's own line items — the agreement is the
 * signed contract and is the source of truth once executed.
 *
 * Idempotent: refuses to double-send if
 * sales_orders.invoice_status is already 'sent' or 'paid'.
 */

import { supabaseAdmin } from "./supabaseAdmin";
import { Resend } from "resend";
import { buildOrderItemsFromAgreement } from "@/lib/agreements/toOrder";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

interface AgreementLineItem {
  service_name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: "pending" | "pending_fulfillment";
}

/**
 * Build the invoice-facing line items from an agreement's snapshot
 * fields. Matches the logic in generateAgreementPdf.autoCreateOrderAndSendInvoice
 * so the two paths produce the same customer-facing invoice from
 * the same signed agreement.
 *
 * The pending_fulfillment items (location services remaining
 * balance) are excluded from the invoice by the caller — they're
 * billed separately as each location secures.
 */
export function buildAgreementLineItems(ag: Record<string, unknown>): AgreementLineItem[] {
  // Read the same snapshot the contract PDF renders, so the invoice the
  // customer receives lists exactly the lines they just signed for.
  // This used to rebuild the invoice from the scalar columns — machine
  // quantity x unit price, locations x fee, freight — which silently
  // dropped every coffee, cooler, financing and custom line and billed
  // discounted lines at list price.
  return buildOrderItemsFromAgreement(ag).map((item) => ({
    service_name: String(item.service_name),
    description: (item.description as string) ?? null,
    quantity: Number(item.quantity) || 1,
    unit_price: Number(item.unit_price) || 0,
    total_price: Number(item.total_price) || 0,
    status: item.status === "pending_fulfillment" ? "pending_fulfillment" : "pending",
  }));
}

/**
 * Per-unit price for an invoicing system that multiplies quantity by
 * amount. A discounted line's unit_price x quantity overstates the
 * line, so bill the discounted rate instead and let the total match
 * the contract to the cent.
 */
export function billableUnitAmount(item: AgreementLineItem): number {
  const qty = Number(item.quantity) || 1;
  if (qty <= 0) return item.total_price;
  return Math.round((item.total_price / qty + Number.EPSILON) * 100) / 100;
}

export interface SignedAgreementInvoiceResult {
  ok: boolean;
  reason?: string;
  qb_invoice_id?: string | null;
  amount?: number;
  channel?: "quickbooks" | "resend";
}

/**
 * Fire the invoice for a signed agreement's linked sales_order.
 * Called from POST /api/sales/orders/[id]/status when the rep
 * marks the agreement signed.
 *
 * Returns { ok: true, reason: '<code>' } on non-fatal no-ops so
 * the caller can distinguish "nothing to do" from "actually sent."
 */
export async function sendInvoiceForSignedAgreement(
  agreementId: string,
): Promise<SignedAgreementInvoiceResult> {
  const { data: ag } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", agreementId)
    .maybeSingle();

  if (!ag) return { ok: false, reason: "agreement_not_found" };

  // Location placement agreements have their own apex-placement
  // invoice flow (see generateAgreementPdf.ts:879). Skip them here.
  if (ag.agreement_type === "location_placement") {
    return { ok: true, reason: "location_placement_uses_own_path" };
  }

  if (!ag.order_id) {
    // No linked order — this agreement will be handled by the
    // countersign path (autoCreateOrderAndSendInvoice) if the
    // auto_send toggle is on, or by the rep clicking Send Invoice
    // after they convert to an order.
    return { ok: true, reason: "no_linked_order" };
  }

  const { data: order } = await supabaseAdmin
    .from("sales_orders")
    .select(
      "id, order_number, invoice_status, recipient_email, qb_invoice_id, sales_accounts:account_id(business_name, contact_name, email, phone)",
    )
    .eq("id", ag.order_id)
    .maybeSingle();

  if (!order) return { ok: false, reason: "order_not_found" };

  if (order.invoice_status === "sent" || order.invoice_status === "paid") {
    return { ok: true, reason: "invoice_already_sent" };
  }

  const items = buildAgreementLineItems(ag);
  const upfront = items.filter((i) => i.status !== "pending_fulfillment");
  if (upfront.length === 0) {
    return { ok: true, reason: "no_billable_items" };
  }
  const amount = upfront.reduce((sum, i) => sum + i.total_price, 0);
  if (amount <= 0) {
    return { ok: true, reason: "zero_amount" };
  }

  const account = order.sales_accounts as
    | { business_name?: string; contact_name?: string; email?: string; phone?: string }
    | null;
  const recipientEmail =
    order.recipient_email ||
    ag.operator_email ||
    account?.email ||
    null;
  if (!recipientEmail) {
    return { ok: false, reason: "no_recipient_email" };
  }
  const customerName =
    ag.operator_company_name ||
    ag.operator_legal_name ||
    account?.business_name ||
    "Customer";
  const customerPhone = ag.operator_phone || account?.phone || undefined;

  const orderNumberDisplay = order.order_number || order.id.slice(0, 8).toUpperCase();

  let qbInvoiceId: string | null = null;
  let channel: "quickbooks" | "resend" | null = null;

  const qbConfigured = !!(process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET);
  if (qbConfigured) {
    try {
      const { createInvoice, sendInvoiceEmail } = await import("@/lib/quickbooks");
      const lineItems = upfront.map((item) => ({
        description: item.service_name,
        amount: billableUnitAmount(item),
        quantity: item.quantity,
      }));
      const invoicePromise = createInvoice({
        customerEmail: recipientEmail,
        customerName,
        customerPhone,
        lineItems,
        memo: `Order #${orderNumberDisplay} — signed agreement invoice`,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("QB timeout")), 8000),
      );
      const invoice = await Promise.race([invoicePromise, timeoutPromise]);
      qbInvoiceId = invoice.Id;
      await Promise.race([
        sendInvoiceEmail(invoice.Id, recipientEmail),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("QB email timeout")), 5000)),
      ]);
      channel = "quickbooks";
    } catch (e) {
      console.error("[agreementInvoicing] QB path failed, falling back:", e);
    }
  }

  if (!channel && process.env.RESEND_API_KEY) {
    try {
      const rows = upfront
        .map(
          (i) =>
            `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111;">${i.service_name}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#374151;">${i.quantity}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151;">$${i.unit_price.toFixed(2)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151;">$${i.total_price.toFixed(2)}</td></tr>`,
        )
        .join("");
      await getResend().emails.send({
        from: FROM_EMAIL,
        to: recipientEmail,
        cc: ["james@apexaivending.com"],
        subject: `Invoice — Order #${orderNumberDisplay} (Apex AI Vending)`,
        html: `
<div style="max-width:640px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 24px;">
  <h1 style="color:#16a34a;font-size:22px;margin:0 0 16px;">Invoice for Order #${orderNumberDisplay}</h1>
  <p style="font-size:14px;color:#374151;margin:0 0 16px;">
    Thank you for executing your agreement. The invoice reflecting the signed terms is below. Please remit payment to begin procurement.
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
    <thead>
      <tr style="background:#e5e7eb;">
        <th style="padding:8px 12px;text-align:left;color:#374151;">Item</th>
        <th style="padding:8px 12px;text-align:center;color:#374151;">Qty</th>
        <th style="padding:8px 12px;text-align:right;color:#374151;">Unit</th>
        <th style="padding:8px 12px;text-align:right;color:#374151;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
    <tr style="border-top:2px solid #e5e7eb;">
      <td style="padding:8px 0 0;color:#111;font-weight:700;">Total Due</td>
      <td style="padding:8px 0 0;text-align:right;color:#16a34a;font-weight:700;font-size:18px;">$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
    </tr>
  </table>
  ${ag.payment_method_notes ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;"><strong>Payment Instructions:</strong> ${ag.payment_method_notes}</p>` : ""}
</div>`.trim(),
      });
      channel = "resend";
    } catch (e) {
      return {
        ok: false,
        reason: `resend_failed:${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  if (!channel) {
    return { ok: false, reason: "no_channel_configured" };
  }

  await supabaseAdmin
    .from("sales_orders")
    .update({
      qb_invoice_id: qbInvoiceId ?? order.qb_invoice_id,
      invoice_status: "sent",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: order.id,
    activity_type: "invoice_sent",
    description: `Invoice auto-sent to ${recipientEmail} on agreement signing — $${amount.toFixed(2)} via ${channel}`,
  });
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: ag.id,
    activity_type: "invoice_sent_on_signing",
    description: `Order #${orderNumberDisplay} invoice auto-sent to ${recipientEmail} — $${amount.toFixed(2)} via ${channel}`,
  });

  return { ok: true, qb_invoice_id: qbInvoiceId, amount, channel };
}
