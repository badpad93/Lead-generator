import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateReceiptPdf, ReceiptData } from "@/lib/generateReceiptPdf";
import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const ADMIN_CC = "james@apexaivending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export interface SendReceiptParams {
  orderId: string;
  paymentType: "deposit" | "full";
  paymentMethod?: string | null;
  paymentReference?: string | null;
  userId?: string | null;
}

export async function sendOrderReceipt(params: SendReceiptParams): Promise<{
  ok: boolean;
  error?: string;
  fileUrl?: string;
  recipientEmail?: string;
}> {
  const { orderId, paymentType, paymentMethod, paymentReference, userId } = params;

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(*), order_items(*)")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return { ok: false, error: "Order not found" };

  const recipientEmail = order.recipient_email || order.sales_accounts?.email;
  if (!recipientEmail) {
    return { ok: false, error: "No recipient email on order or account" };
  }

  const account = order.sales_accounts;
  const items = order.order_items || [];
  const totalValue = Number(order.total_value) || 0;
  const depositAmount = Number(order.deposit_amount) || 0;

  const amountPaid = paymentType === "deposit" ? depositAmount : totalValue;
  const balanceRemaining = paymentType === "deposit"
    ? Math.max(0, totalValue - depositAmount)
    : 0;

  const receiptData: ReceiptData = {
    order_number: order.order_number || order.id.slice(0, 8).toUpperCase(),
    invoice_number: order.qb_invoice_id || null,
    paid_at: new Date().toISOString(),
    payment_type: paymentType,
    payment_method: paymentMethod || order.payment_method || null,
    payment_reference: paymentReference || order.payment_reference || null,
    amount_paid: amountPaid,
    total_value: totalValue,
    balance_remaining: balanceRemaining,
    customer_name: account?.contact_name || "",
    customer_company: account?.business_name || null,
    customer_email: recipientEmail,
    customer_phone: account?.phone || null,
    customer_address: account?.address || null,
    items: items.map((item: {
      service_name?: string;
      description?: string | null;
      quantity?: number;
      unit_price?: number;
      total_price?: number;
    }) => ({
      service_name: item.service_name || "Item",
      description: item.description || null,
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
      total_price: Number(item.total_price) || 0,
    })),
    notes: order.notes || null,
  };

  const pdfBytes = await generateReceiptPdf(receiptData);
  const pdfBuffer = Buffer.from(pdfBytes);

  const businessSlug = (account?.business_name || "customer").replace(/[^a-zA-Z0-9]/g, "_");
  const label = paymentType === "deposit" ? "Deposit-Receipt" : "Receipt";
  const fileName = `${label}-${businessSlug}-${orderId.slice(0, 8)}.pdf`;
  const storagePath = `receipts/${orderId}/${fileName}`;

  // Upload PDF
  let fileUrl = "";
  try {
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("sales-documents")
      .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });
    if (!uploadErr) {
      const { data: urlData } = supabaseAdmin.storage
        .from("sales-documents")
        .getPublicUrl(storagePath);
      fileUrl = urlData?.publicUrl || "";
    }
  } catch {
    // Non-fatal — email still gets sent
  }

  // Record in sales_documents so it shows in the account
  if (order.account_id) {
    try {
      await supabaseAdmin.from("sales_documents").insert({
        account_id: order.account_id,
        order_id: orderId,
        file_url: fileUrl || null,
        file_name: `${paymentType === "deposit" ? "Deposit Receipt" : "Payment Receipt"} — ${account?.business_name || "Customer"}`,
        type: "receipt",
      });
    } catch {
      // Non-fatal
    }
  }

  // Send email
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const businessName = account?.business_name || "Customer";
  const contactName = account?.contact_name || "there";
  const subject = paymentType === "deposit"
    ? `Deposit received — Order #${order.order_number || orderId.slice(0, 8).toUpperCase()}`
    : `Payment received — Order #${order.order_number || orderId.slice(0, 8).toUpperCase()}`;

  const ccList = [ADMIN_CC];
  // Also CC assigned rep
  if (order.assigned_rep_id) {
    try {
      const { data: rep } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", order.assigned_rep_id)
        .single();
      if (rep?.email && rep.email !== recipientEmail && !ccList.includes(rep.email)) {
        ccList.push(rep.email);
      }
    } catch {}
  }

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      cc: ccList,
      subject,
      html: `
<div style="max-width:640px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 24px;color:#111827;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="color:#16a34a;font-size:24px;margin:0;">Apex AI Vending</h1>
    <p style="color:#6b7280;font-size:14px;margin:4px 0 0;">${paymentType === "deposit" ? "Deposit Received" : "Payment Received"}</p>
  </div>
  <div style="background:#f9fafb;border-radius:12px;padding:24px;margin-bottom:24px;">
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">Hi ${contactName},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      Thank you for your payment. We&apos;ve received your ${paymentType === "deposit" ? "deposit" : "payment"} for order
      <strong>#${order.order_number || orderId.slice(0, 8).toUpperCase()}</strong>. Your receipt is attached to this email.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
      <tr>
        <td style="padding:6px 0;color:#6b7280;">Business</td>
        <td style="padding:6px 0;text-align:right;color:#111;font-weight:600;">${businessName}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b7280;">Order Total</td>
        <td style="padding:6px 0;text-align:right;color:#111;">$${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b7280;">${paymentType === "deposit" ? "Deposit Received" : "Amount Paid"}</td>
        <td style="padding:6px 0;text-align:right;color:#16a34a;font-weight:700;font-size:16px;">$${amountPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
      </tr>
      ${balanceRemaining > 0.005 ? `<tr>
        <td style="padding:6px 0;color:#6b7280;">Balance Remaining</td>
        <td style="padding:6px 0;text-align:right;color:#b45309;font-weight:600;">$${balanceRemaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
      </tr>` : ""}
      ${paymentMethod ? `<tr>
        <td style="padding:6px 0;color:#6b7280;">Method</td>
        <td style="padding:6px 0;text-align:right;color:#111;">${paymentMethod}</td>
      </tr>` : ""}
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
      A full itemized receipt is attached as a PDF for your records.
    </p>
  </div>
  <p style="font-size:13px;color:#6b7280;text-align:center;">
    Questions? Contact <a href="mailto:james@apexaivending.com" style="color:#16a34a;">james@apexaivending.com</a>
    or call <a href="tel:+18888511462" style="color:#16a34a;">(888) 851-1462</a>
  </p>
</div>
      `.trim(),
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer.toString("base64"),
        },
      ],
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email send failed" };
  }

  // Mark receipt as sent
  const nowIso = new Date().toISOString();
  const receiptField = paymentType === "deposit" ? "deposit_receipt_status" : "receipt_status";
  const sentAtField = paymentType === "deposit" ? "deposit_receipt_sent_at" : "receipt_sent_at";
  const updates: Record<string, unknown> = {
    [receiptField]: "sent",
    [sentAtField]: nowIso,
    updated_at: nowIso,
  };
  if (paymentMethod) updates.payment_method = paymentMethod;
  if (paymentReference) updates.payment_reference = paymentReference;

  await supabaseAdmin.from("sales_orders").update(updates).eq("id", orderId);

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: orderId,
    user_id: userId || null,
    activity_type: paymentType === "deposit" ? "deposit_receipt_sent" : "receipt_sent",
    description: `${paymentType === "deposit" ? "Deposit receipt" : "Payment receipt"} emailed to ${recipientEmail}`,
  });

  return { ok: true, fileUrl, recipientEmail };
}
