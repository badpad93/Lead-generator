import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { Resend } from "resend";
import { createInvoice, sendInvoiceEmail } from "@/lib/quickbooks";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const NOREPLY_EMAIL = process.env.NOREPLY_EMAIL || "noreply@bytebitevending.com";
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: orderId } = await params;

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(*), order_items(*)")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const account = order.sales_accounts;
  const items = order.order_items || [];
  const recipientEmail = order.recipient_email || account?.email || "";
  const isQuote = order.document_type === "quote";

  if (!recipientEmail) {
    return NextResponse.json({ error: "No recipient email on order or account" }, { status: 400 });
  }

  // Look up the sending rep's email for quote memo
  const { data: repProfile } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", order.assigned_rep_id || order.created_by)
    .single();

  // Build CC list
  const ccEmails: string[] = [];
  if (account?.notification_emails) {
    const extras = (account.notification_emails as string)
      .split(",")
      .map((e: string) => e.trim())
      .filter(Boolean);
    ccEmails.push(...extras);
  }
  if (ADMIN_EMAIL && !ccEmails.includes(ADMIN_EMAIL) && ADMIN_EMAIL !== recipientEmail) {
    ccEmails.push(ADMIN_EMAIL);
  }
  if (repProfile?.email && !ccEmails.includes(repProfile.email) && repProfile.email !== recipientEmail) {
    ccEmails.push(repProfile.email);
  }

  const docHtml = generateDocumentHtml(order, account, items, isQuote, repProfile?.email);

  // Upload document
  const docLabel = isQuote ? "quote" : "order";
  const fileName = `${docLabel}-${orderId.slice(0, 8)}-${Date.now()}.html`;
  const filePath = `orders/${fileName}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("documents")
    .upload(filePath, new Blob([docHtml], { type: "text/html" }), {
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

  if (fileUrl && order.account_id) {
    await supabaseAdmin.from("sales_documents").insert({
      account_id: order.account_id,
      order_id: orderId,
      file_url: fileUrl,
      type: isQuote ? "quote_pdf" : "order_pdf",
      file_name: fileName,
    });
  }

  let emailSent = false;
  let emailError: string | null = null;
  let qbInvoiceId: string | null = null;

  if (isQuote) {
    // QUOTE: Send email from noreply with rep email in memo
    if (!process.env.RESEND_API_KEY) {
      emailError = "RESEND_API_KEY is not configured";
    } else {
      try {
        const businessName = account?.business_name || "Customer";
        const repEmail = repProfile?.email || "support@vendingconnector.com";
        const emailPayload: {
          from: string;
          to: string;
          cc?: string[];
          replyTo: string;
          subject: string;
          html: string;
        } = {
          from: NOREPLY_EMAIL,
          to: recipientEmail,
          replyTo: repEmail,
          subject: `Quote from Apex AI Vending — ${businessName}`,
          html: `<p>Hi ${account?.contact_name || "there"},</p>
<p>Please find your quote details below from <strong>Apex AI Vending</strong>.</p>
<hr/>${docHtml}
<hr/>
<p style="color:#6b7280;font-size:13px;">For questions, please reply to: <a href="mailto:${repEmail}">${repEmail}</a></p>`,
        };
        if (ccEmails.length > 0) emailPayload.cc = ccEmails;

        const result = await getResend().emails.send(emailPayload);
        if (result.error) {
          emailError = result.error.message || String(result.error);
        } else {
          emailSent = true;
        }
      } catch (e) {
        emailError = e instanceof Error ? e.message : String(e);
      }
    }
  } else {
    // ORDER: Create QB invoice and send payment link
    try {
      const lineItems = items.map((item: { service_name: string; unit_price: number; price?: number; quantity: number; discount_percent?: number }) => {
        const unitPrice = Number(item.unit_price) || Number(item.price) || 0;
        const discount = Number(item.discount_percent) || 0;
        const effectivePrice = unitPrice * (1 - discount / 100);
        return {
          description: item.service_name + (discount > 0 ? ` (${discount}% off)` : ""),
          amount: effectivePrice,
          quantity: Number(item.quantity) || 1,
        };
      });

      const invoice = await createInvoice({
        customerEmail: recipientEmail,
        customerName: account?.business_name || account?.contact_name || "Customer",
        customerPhone: account?.phone || undefined,
        lineItems,
        memo: `Order #${order.order_number || orderId.slice(0, 8).toUpperCase()}`,
      });

      qbInvoiceId = invoice.Id;

      await sendInvoiceEmail(invoice.Id, recipientEmail);
      emailSent = true;

      await supabaseAdmin
        .from("sales_orders")
        .update({
          qb_invoice_id: qbInvoiceId,
          invoice_status: "sent",
        })
        .eq("id", orderId);
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);

      // Fallback: send order summary via Resend if QB fails
      if (process.env.RESEND_API_KEY) {
        try {
          const businessName = account?.business_name || "Customer";
          const result = await getResend().emails.send({
            from: FROM_EMAIL,
            to: recipientEmail,
            cc: ccEmails.length > 0 ? ccEmails : undefined,
            subject: `New Order – ${businessName}`,
            html: `<p>A new service order has been submitted for <strong>${businessName}</strong>.</p><p>Please see the order summary below.</p><hr/>${docHtml}`,
          });
          if (!result.error) {
            emailSent = true;
            emailError = `QB invoice failed (${emailError}), but email was sent via fallback`;
          }
        } catch {
          // Both QB and fallback failed
        }
      }
    }
  }

  if (emailSent) {
    await supabaseAdmin
      .from("sales_orders")
      .update({ status: "sent", order_status: "invoice_sent", updated_at: new Date().toISOString() })
      .eq("id", orderId);

    await supabaseAdmin.from("order_activity_log").insert({
      order_id: orderId,
      user_id: user.id,
      activity_type: isQuote ? "quote_sent" : "order_sent",
      description: isQuote
        ? `Quote emailed to ${recipientEmail}`
        : `Invoice/payment link sent to ${recipientEmail}`,
    });

    // Send confirmation copy to the sales rep
    if (repProfile?.email && process.env.RESEND_API_KEY && repProfile.email !== recipientEmail) {
      const docLabel = isQuote ? "Quote" : "Order";
      try {
        await getResend().emails.send({
          from: FROM_EMAIL,
          to: repProfile.email,
          subject: `${docLabel} Sent — ${account?.business_name || "Customer"}`,
          html: `<p>Your ${docLabel.toLowerCase()} for <strong>${account?.business_name || "Customer"}</strong> has been sent to ${recipientEmail}.</p><hr/>${docHtml}`,
        });
      } catch {
        // Non-critical — don't fail the main flow
      }
    }
  }

  return NextResponse.json({
    ok: emailSent,
    emailSent,
    emailError,
    recipient: recipientEmail,
    cc: ccEmails,
    from: isQuote ? NOREPLY_EMAIL : FROM_EMAIL,
    fileUrl,
    qbInvoiceId,
    documentType: isQuote ? "quote" : "order",
  });
}

function generateDocumentHtml(
  order: Record<string, unknown>,
  account: Record<string, unknown> | null,
  items: Array<{ service_name: string; price: number; unit_price?: number; quantity?: number; discount_percent?: number; notes: string | null }>,
  isQuote: boolean,
  repEmail?: string | null,
) {
  const total = items.reduce((s, i) => {
    const qty = Number(i.quantity) || 1;
    const price = Number(i.unit_price || i.price) || 0;
    const discount = Number(i.discount_percent) || 0;
    return s + qty * price * (1 - discount / 100);
  }, 0);
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const docLabel = isQuote ? "Quote" : "Service Order";
  const idLabel = isQuote ? "Quote ID" : "Order ID";

  const rows = items
    .map((item) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unit_price || item.price) || 0;
      const discount = Number(item.discount_percent) || 0;
      const lineTotal = qty * price * (1 - discount / 100);
      const discountLabel = discount > 0 ? ` <span style="color:#16a34a;font-size:11px;">(${discount}% off)</span>` : "";
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.service_name}${discountLabel}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${qty}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${lineTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
      </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>${docLabel} Summary</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:700px;margin:0 auto;padding:40px 24px;color:#111827;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#16a34a;font-size:22px;margin:0;">Apex AI Vending</h1>
    <h2 style="font-size:18px;color:#374151;margin:8px 0 0;font-weight:500;">${docLabel} Summary</h2>
  </div>

  <table style="width:100%;font-size:14px;margin-bottom:24px;">
    <tr>
      <td style="padding:4px 0;color:#6b7280;">Date:</td>
      <td style="padding:4px 0;font-weight:600;">${date}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;color:#6b7280;">${idLabel}:</td>
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
  </table>

  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
    <thead>
      <tr style="background:#f9fafb;">
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;">Item</th>
        <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;">Qty</th>
        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;">Unit Price</th>
        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr style="background:#f9fafb;">
        <td colspan="3" style="padding:12px;font-weight:700;font-size:15px;">Total</td>
        <td style="padding:12px;text-align:right;font-weight:700;font-size:15px;color:#16a34a;">$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
      </tr>
    </tfoot>
  </table>

  ${order.notes ? `<div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;"><p style="margin:0 0 4px;font-weight:600;font-size:13px;color:#6b7280;">Notes</p><p style="margin:0;font-size:14px;">${String(order.notes)}</p></div>` : ""}

  ${isQuote && repEmail ? `<p style="font-size:13px;color:#6b7280;">For questions, please reply to: <a href="mailto:${repEmail}" style="color:#16a34a;">${repEmail}</a></p>` : ""}

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
  <p style="text-align:center;font-size:12px;color:#9ca3af;">Apex AI Vending &bull; ${docLabel} &bull; Generated ${date}</p>
</body>
</html>`;
}
