import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: orderId } = await params;

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(business_name, contact_name, email, phone), order_items(*)")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.location_remaining_invoice_status === "sent" || order.location_remaining_invoice_status === "paid") {
    return NextResponse.json({ error: "Remaining balance invoice has already been sent" }, { status: 400 });
  }

  const remainingItem = (order.order_items || []).find(
    (i: { status?: string; service_name?: string }) =>
      i.status === "pending_fulfillment" && i.service_name === "Location Services Remaining Balance"
  );

  if (!remainingItem) {
    return NextResponse.json({ error: "No remaining balance line item found on this order" }, { status: 400 });
  }

  const recipientEmail = order.recipient_email || order.sales_accounts?.email;
  if (!recipientEmail) {
    return NextResponse.json({ error: "No recipient email on order or account" }, { status: 400 });
  }

  const amount = Number(remainingItem.total_price) || 0;
  const businessName = order.sales_accounts?.business_name || "Customer";
  const contactName = order.sales_accounts?.contact_name || "there";

  let qbInvoiceId: string | null = null;
  let sent = false;

  const qbConfigured = !!(process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET);
  if (qbConfigured) {
    try {
      const { createInvoice, sendInvoiceEmail } = await import("@/lib/quickbooks");
      const invoicePromise = createInvoice({
        customerEmail: recipientEmail,
        customerName: businessName,
        customerPhone: order.sales_accounts?.phone || undefined,
        lineItems: [{
          description: "Location Services Remaining Balance",
          amount,
          quantity: 1,
        }],
        memo: `Order #${order.order_number || orderId.slice(0, 8).toUpperCase()} — Location Services Remaining Balance`,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("QB timeout")), 8000)
      );
      const invoice = await Promise.race([invoicePromise, timeoutPromise]);
      qbInvoiceId = invoice.Id;

      await Promise.race([
        sendInvoiceEmail(invoice.Id, recipientEmail),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("QB email timeout")), 5000)),
      ]);
      sent = true;
    } catch {
      // Fall through to Resend
    }
  }

  if (!sent && process.env.RESEND_API_KEY) {
    try {
      await getResend().emails.send({
        from: FROM_EMAIL,
        to: recipientEmail,
        subject: `Location Services Remaining Balance — Order #${order.order_number || orderId.slice(0, 8).toUpperCase()}`,
        html: `
<div style="max-width:640px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 24px;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="color:#16a34a;font-size:24px;margin:0;">Apex AI Vending</h1>
    <p style="color:#6b7280;font-size:14px;margin:4px 0 0;">Location Services Remaining Balance</p>
  </div>
  <div style="background:#f9fafb;border-radius:12px;padding:24px;margin-bottom:24px;">
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">Hello ${contactName},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      Your secured locations have been fulfilled. Per the terms of your purchase agreement, the remaining balance for location services is now due.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
      <tr style="border-top:2px solid #e5e7eb;">
        <td style="padding:8px 0 0;color:#111;font-weight:700;">Location Services Remaining Balance</td>
        <td style="padding:8px 0 0;text-align:right;color:#16a34a;font-weight:700;font-size:18px;">$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
      </tr>
    </table>
  </div>
  <p style="font-size:13px;color:#6b7280;text-align:center;">
    Questions? Contact <a href="mailto:james@apexaivending.com" style="color:#16a34a;">james@apexaivending.com</a>
    or call <a href="tel:+18888511462" style="color:#16a34a;">(888) 851-1462</a>
  </p>
</div>
        `.trim(),
      });
      sent = true;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Email failed" }, { status: 500 });
    }
  }

  if (!sent) {
    return NextResponse.json({ error: "No email service configured (set RESEND_API_KEY or QuickBooks creds)" }, { status: 500 });
  }

  await supabaseAdmin
    .from("sales_orders")
    .update({
      location_remaining_invoice_status: "sent",
      location_remaining_invoice_sent_at: new Date().toISOString(),
      location_remaining_qb_invoice_id: qbInvoiceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  // Also update the pending_fulfillment line item to invoiced
  await supabaseAdmin
    .from("order_items")
    .update({ status: "invoiced" })
    .eq("id", remainingItem.id);

  return NextResponse.json({ success: true, amount, sent_to: recipientEmail });
}
