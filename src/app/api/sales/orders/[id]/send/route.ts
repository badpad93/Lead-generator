import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { Resend } from "resend";
import { createInvoice, sendInvoiceEmail } from "@/lib/quickbooks";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const ALWAYS_CC = ["james@apexaivending.com", "katrina.cacdac@apexaivending.com"];

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
    return NextResponse.json({ error: "No recipient email — please add a recipient email or select an account with an email on file." }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email service not configured (RESEND_API_KEY missing)" }, { status: 500 });
  }

  // Look up the sending rep's email
  const { data: repProfile } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", order.assigned_rep_id || order.created_by)
    .single();

  // Build CC list
  const ccEmails: string[] = [];
  if (repProfile?.email && repProfile.email !== recipientEmail) {
    ccEmails.push(repProfile.email);
  }
  for (const addr of ALWAYS_CC) {
    if (!ccEmails.includes(addr) && addr !== recipientEmail) {
      ccEmails.push(addr);
    }
  }
  if (account?.notification_emails) {
    const extras = (account.notification_emails as string)
      .split(",")
      .map((e: string) => e.trim())
      .filter(Boolean);
    for (const e of extras) {
      if (!ccEmails.includes(e) && e !== recipientEmail) ccEmails.push(e);
    }
  }

  const docHtml = generateDocumentHtml(order, account, items, isQuote, repProfile?.email);

  // Save document to account
  const docLabel = isQuote ? "Quote" : "Order";
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const cleanBusinessName = (account?.business_name || "Customer").replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const displayName = `${docLabel} - ${account?.business_name || "Customer"} - ${dateStr}`;
  const fileName = `${docLabel.toLowerCase()}-${cleanBusinessName}-${orderId.slice(0, 8)}.html`;
  const filePath = `orders/${fileName}`;
  let fileUrl = "";

  try {
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("documents")
      .upload(filePath, new Blob([docHtml], { type: "text/html" }), {
        contentType: "text/html",
        upsert: true,
      });

    if (!uploadErr) {
      const { data: urlData } = supabaseAdmin.storage.from("documents").getPublicUrl(filePath);
      fileUrl = urlData.publicUrl;
    }
  } catch {
    // Storage upload is non-critical
  }

  // Link document to account — always save a record so it shows in the account
  if (order.account_id) {
    try {
      await supabaseAdmin.from("sales_documents").insert({
        account_id: order.account_id,
        order_id: orderId,
        file_url: fileUrl || null,
        type: isQuote ? "quote_pdf" : "order_pdf",
        file_name: displayName,
      });
    } catch {
      // Non-critical
    }
  }

  // === SEND EMAIL — always via Resend as primary ===
  let emailSent = false;
  let emailError: string | null = null;
  let qbInvoiceId: string | null = null;

  const businessName = account?.business_name || "Customer";
  const contactName = account?.contact_name || "there";
  const repEmail = repProfile?.email || "support@vendingconnector.com";

  if (isQuote) {
    // QUOTE: noreply email with rep email in memo
    try {
      const result = await getResend().emails.send({
        from: FROM_EMAIL,
        to: recipientEmail,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        replyTo: repEmail,
        subject: `Quote from Apex AI Vending — ${businessName}`,
        html: `<p>Hi ${contactName},</p>
<p>Please find your quote details below from <strong>Apex AI Vending</strong>.</p>
<hr/>${docHtml}
<hr/>
<p style="color:#6b7280;font-size:13px;">For questions, please reply to: <a href="mailto:${repEmail}">${repEmail}</a></p>`,
      });
      if (result.error) {
        emailError = result.error.message || String(result.error);
      } else {
        emailSent = true;
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
    }
  } else {
    // ORDER: Send via Resend (primary). Try QB invoice only if configured.
    const qbConfigured = !!(process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET);

    if (qbConfigured) {
      try {
        const lineItems = items.map((item: { service_name: string; unit_price: number; price?: number; quantity: number; discount_percent?: number; total_price?: number }) => {
          const qty = Number(item.quantity) || 1;
          const unitPrice = Number(item.unit_price) || Number(item.price) || 0;
          const discount = Number(item.discount_percent) || 0;
          let effectivePrice = unitPrice * (1 - discount / 100);
          if (effectivePrice === 0 && Number(item.total_price) > 0) {
            effectivePrice = Number(item.total_price) / qty;
          }
          return {
            description: item.service_name + (discount > 0 ? ` (${discount}% off)` : ""),
            amount: effectivePrice,
            quantity: qty,
          };
        });

        // 8-second timeout so QB doesn't eat the entire function timeout
        const invoicePromise = createInvoice({
          customerEmail: recipientEmail,
          customerName: businessName,
          customerPhone: account?.phone || undefined,
          lineItems,
          memo: `Order #${order.order_number || orderId.slice(0, 8).toUpperCase()}`,
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
        emailSent = true;

        await supabaseAdmin
          .from("sales_orders")
          .update({ qb_invoice_id: qbInvoiceId, invoice_status: "sent" })
          .eq("id", orderId);
      } catch {
        // QB failed or timed out — fall through to Resend
      }
    }

    // Always send via Resend if QB didn't succeed
    if (!emailSent) {
      try {
        const result = await getResend().emails.send({
          from: FROM_EMAIL,
          to: recipientEmail,
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          subject: `Order Confirmation – ${businessName}`,
          html: `<p>Hi ${contactName},</p>
<p>Your order has been submitted. Please see the details below.</p>
<hr/>${docHtml}`,
        });
        if (result.error) {
          emailError = result.error.message || String(result.error);
        } else {
          emailSent = true;
        }
      } catch (e) {
        emailError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  // Update order status and log activity
  if (emailSent) {
    await supabaseAdmin
      .from("sales_orders")
      .update({ status: "sent", order_status: "invoice_sent", updated_at: new Date().toISOString() })
      .eq("id", orderId);

    await supabaseAdmin.from("order_activity_log").insert({
      order_id: orderId,
      user_id: user.id,
      activity_type: isQuote ? "quote_sent" : "order_sent",
      description: `${isQuote ? "Quote" : "Order"} emailed to ${recipientEmail}` + (ccEmails.length > 0 ? ` (CC: ${ccEmails.join(", ")})` : ""),
    });
  }

  return NextResponse.json({
    ok: emailSent,
    emailSent,
    emailError,
    recipient: recipientEmail,
    cc: ccEmails,
    qbInvoiceId,
  });
}

function generateDocumentHtml(
  order: Record<string, unknown>,
  account: Record<string, unknown> | null,
  items: Array<{ service_name: string; price: number; unit_price?: number; quantity?: number; discount_percent?: number; total_price?: number; notes: string | null }>,
  isQuote: boolean,
  repEmail?: string | null,
) {
  let total = items.reduce((s, i) => {
    const qty = Number(i.quantity) || 1;
    const price = Number(i.unit_price || i.price) || 0;
    const discount = Number(i.discount_percent) || 0;
    return s + qty * price * (1 - discount / 100);
  }, 0);
  // Fallback: use stored total_value or sum of total_price fields
  if (total === 0) {
    const fromTotalPrice = items.reduce((s, i) => s + (Number(i.total_price) || 0), 0);
    if (fromTotalPrice > 0) {
      total = fromTotalPrice;
    } else if (Number(order.total_value) > 0) {
      total = Number(order.total_value);
    }
  }
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const docLabel = isQuote ? "Quote" : "Service Order";
  const idLabel = isQuote ? "Quote ID" : "Order ID";

  const rows = items
    .map((item) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unit_price || item.price) || 0;
      const discount = Number(item.discount_percent) || 0;
      let lineTotal = qty * price * (1 - discount / 100);
      if (lineTotal === 0 && Number(item.total_price) > 0) {
        lineTotal = Number(item.total_price);
      }
      const unitDisplay = price > 0 ? price : (lineTotal / qty);
      const discountLabel = discount > 0 ? ` <span style="color:#16a34a;font-size:11px;">(${discount}% off)</span>` : "";
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.service_name}${discountLabel}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${qty}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${unitDisplay.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
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
