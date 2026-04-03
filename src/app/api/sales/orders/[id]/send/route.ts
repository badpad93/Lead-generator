import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * POST /api/sales/orders/[id]/send
 * Generates PDF, uploads to storage, emails to recipient, marks order as sent.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: orderId } = await params;

  // Fetch order with items and account
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(*), order_items(*)")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const account = order.sales_accounts;
  const items = order.order_items || [];
  const recipientEmail = order.recipient_email || "james@apexaivending.com";

  // Generate PDF HTML
  const pdfHtml = generateOrderPdfHtml(order, account, items);

  // Upload HTML as PDF-ready document to Supabase storage
  const fileName = `order-${orderId.slice(0, 8)}-${Date.now()}.html`;
  const filePath = `orders/${fileName}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("documents")
    .upload(filePath, new Blob([pdfHtml], { type: "text/html" }), {
      contentType: "text/html",
      upsert: true,
    });

  let fileUrl = "";
  if (!uploadErr) {
    const { data: urlData } = supabaseAdmin.storage
      .from("documents")
      .getPublicUrl(filePath);
    fileUrl = urlData.publicUrl;
  }

  // Save document record
  if (fileUrl && order.account_id) {
    await supabaseAdmin.from("sales_documents").insert({
      account_id: order.account_id,
      order_id: orderId,
      file_url: fileUrl,
      type: "order_pdf",
      file_name: fileName,
    });
  }

  // Send email via Resend
  try {
    const businessName = account?.business_name || "Customer";
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: `New Order – ${businessName}`,
      html: `<p>A new service order has been submitted for <strong>${businessName}</strong>.</p><p>Please see the attached order summary below.</p><hr/>${pdfHtml}`,
    });
  } catch (emailErr) {
    console.error("Email send error:", emailErr);
    // Don't fail the whole operation for email issues
  }

  // Mark order as sent
  await supabaseAdmin
    .from("sales_orders")
    .update({ status: "sent" })
    .eq("id", orderId);

  return NextResponse.json({ ok: true, fileUrl });
}

function generateOrderPdfHtml(
  order: Record<string, unknown>,
  account: Record<string, unknown> | null,
  items: Array<{ service_name: string; price: number; notes: string | null }>
) {
  const total = items.reduce((s, i) => s + Number(i.price), 0);
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.service_name}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${Number(item.price).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.notes || "—"}</td>
        </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>Service Order Summary</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:700px;margin:0 auto;padding:40px 24px;color:#111827;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#16a34a;font-size:22px;margin:0;">Apex AI Vending</h1>
    <h2 style="font-size:18px;color:#374151;margin:8px 0 0;font-weight:500;">Service Order Summary</h2>
  </div>

  <table style="width:100%;font-size:14px;margin-bottom:24px;">
    <tr>
      <td style="padding:4px 0;color:#6b7280;">Date:</td>
      <td style="padding:4px 0;font-weight:600;">${date}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;color:#6b7280;">Order ID:</td>
      <td style="padding:4px 0;font-family:monospace;font-size:12px;">${String(order.id).slice(0, 8).toUpperCase()}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;color:#6b7280;">Customer:</td>
      <td style="padding:4px 0;font-weight:600;">${account?.business_name || "—"}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;color:#6b7280;">Contact:</td>
      <td style="padding:4px 0;">${account?.contact_name || "—"}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;color:#6b7280;">Email:</td>
      <td style="padding:4px 0;">${account?.email || "—"}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;color:#6b7280;">Phone:</td>
      <td style="padding:4px 0;">${account?.phone || "—"}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;color:#6b7280;">Address:</td>
      <td style="padding:4px 0;">${account?.address || "—"}</td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
    <thead>
      <tr style="background:#f9fafb;">
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;">Service</th>
        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;">Price</th>
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;">Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr style="background:#f9fafb;">
        <td style="padding:12px;font-weight:700;font-size:15px;">Total</td>
        <td style="padding:12px;text-align:right;font-weight:700;font-size:15px;color:#16a34a;">$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        <td style="padding:12px;"></td>
      </tr>
    </tfoot>
  </table>

  ${order.notes ? `<div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;"><p style="margin:0 0 4px;font-weight:600;font-size:13px;color:#6b7280;">Notes</p><p style="margin:0;font-size:14px;">${String(order.notes)}</p></div>` : ""}

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
  <p style="text-align:center;font-size:12px;color:#9ca3af;">Apex AI Vending &bull; Service Order &bull; Generated ${date}</p>
</body>
</html>`;
}
