import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * POST /api/sales/orders/[id]/locations/invoice-remaining
 *
 * Create + email the QuickBooks invoice that collects the amount
 * still owed after the deposit is credited against secured
 * locations.
 *
 * Formula:
 *   remaining = Σ secured_price − order.deposit_amount
 *
 * Two callers:
 *   - Auto-fire from /locations/[locId]/secure when secured count
 *     reaches locations_purchased.
 *   - Manual "Invoice remaining balance" button on the CRM (the
 *     A + manual fallback the user asked for). Fires against
 *     whatever secured rows exist right now — allows early
 *     invoicing on partial quota or deferred invoicing.
 *
 * Idempotency: refuses if location_remaining_invoice_status is
 * already 'sent' or 'paid'. To re-invoice, an admin has to null
 * out those fields on the order.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { trigger?: string };

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select(
      "id, order_number, deposit_amount, recipient_email, order_type, location_remaining_invoice_status, sales_accounts:account_id(business_name, contact_name, email, phone)",
    )
    .eq("id", id)
    .maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.order_type !== "location_services") {
    return NextResponse.json(
      { error: "Only location_services orders have a location-remaining balance" },
      { status: 400 },
    );
  }
  if (
    order.location_remaining_invoice_status === "sent" ||
    order.location_remaining_invoice_status === "paid"
  ) {
    return NextResponse.json(
      { error: "Remaining-balance invoice has already been sent" },
      { status: 409 },
    );
  }

  const { data: secured, error: securedErr } = await supabaseAdmin
    .from("sales_order_locations")
    .select("id, business_name, address, tier_label, secured_price")
    .eq("order_id", id)
    .eq("status", "secured");
  if (securedErr) return NextResponse.json({ error: securedErr.message }, { status: 500 });
  if (!secured || secured.length === 0) {
    return NextResponse.json(
      { error: "No secured locations to invoice — secure at least one first" },
      { status: 400 },
    );
  }

  const totalSecuredValue = secured.reduce(
    (sum, row) => sum + (Number(row.secured_price) || 0),
    0,
  );
  const depositAmount = Number(order.deposit_amount) || 0;
  const remaining = Math.max(0, totalSecuredValue - depositAmount);

  if (remaining <= 0) {
    // Deposit fully covers what's secured. Nothing to invoice —
    // just stamp the flag as 'not_needed' and log activity so the
    // rep sees the outcome without an empty invoice going out.
    await supabaseAdmin
      .from("sales_orders")
      .update({
        location_remaining_invoice_status: "not_needed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    await supabaseAdmin.from("order_activity_log").insert({
      order_id: id,
      user_id: user.id,
      activity_type: "location_remaining_not_needed",
      description: `Deposit ($${depositAmount.toFixed(2)}) fully covers secured value ($${totalSecuredValue.toFixed(2)}) — no remaining invoice`,
    });
    return NextResponse.json({ ok: true, remaining: 0, note: "deposit_covers_secured" });
  }

  // Try QBO first, then Resend, matching the pattern in
  // /send-remaining-balance/route.ts (see that file for prior art).
  const account = order.sales_accounts as
    | { business_name?: string; contact_name?: string; email?: string; phone?: string }
    | null;
  const recipientEmail = order.recipient_email || account?.email;
  if (!recipientEmail) {
    return NextResponse.json({ error: "No recipient email on order or account" }, { status: 400 });
  }
  const businessName = account?.business_name || "Customer";

  let qbInvoiceId: string | null = null;
  let sent = false;

  const qbConfigured = !!(process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET);
  if (qbConfigured) {
    try {
      const { createInvoice, sendInvoiceEmail } = await import("@/lib/quickbooks");
      const lineItems = secured.map((row) => ({
        description: `Location placement — ${row.business_name}${row.address ? ` (${row.address})` : ""} — ${row.tier_label ?? "Tier"}`,
        amount: Number(row.secured_price) || 0,
        quantity: 1,
      }));
      lineItems.push({
        description: `Less: deposit already paid`,
        amount: -depositAmount,
        quantity: 1,
      });
      const invoicePromise = createInvoice({
        customerEmail: recipientEmail,
        customerName: businessName,
        customerPhone: account?.phone || undefined,
        lineItems,
        memo: `Order #${order.order_number || id.slice(0, 8).toUpperCase()} — Location Services Remaining Balance`,
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
      sent = true;
    } catch (e) {
      console.error("[locations.invoice-remaining] QB path failed, falling back:", e);
    }
  }

  if (!sent && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const rowsHtml = secured
        .map(
          (r) =>
            `<tr><td style="padding:6px 0;color:#111;">${r.business_name}${r.address ? ` — ${r.address}` : ""} <span style="color:#6b7280;">(${r.tier_label ?? "Tier"})</span></td><td style="padding:6px 0;text-align:right;color:#111;">$${Number(r.secured_price).toFixed(2)}</td></tr>`,
        )
        .join("");
      await resend.emails.send({
        from: process.env.FROM_EMAIL || "receipts@bytebitevending.com",
        to: recipientEmail,
        subject: `Location Services Remaining Balance — Order #${order.order_number || id.slice(0, 8).toUpperCase()}`,
        html: `
<div style="max-width:640px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 24px;">
  <h1 style="color:#16a34a;font-size:22px;margin:0 0 16px;">Location Services Remaining Balance</h1>
  <p style="color:#374151;font-size:14px;margin:0 0 16px;">
    Your secured locations total is shown below. Your deposit has been applied; the remaining balance is due.
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${rowsHtml}
    <tr><td style="padding:8px 0;border-top:1px solid #e5e7eb;color:#111;">Subtotal</td><td style="padding:8px 0;text-align:right;color:#111;border-top:1px solid #e5e7eb;">$${totalSecuredValue.toFixed(2)}</td></tr>
    <tr><td style="padding:4px 0;color:#111;">Less: deposit paid</td><td style="padding:4px 0;text-align:right;color:#111;">−$${depositAmount.toFixed(2)}</td></tr>
    <tr><td style="padding:8px 0;border-top:2px solid #e5e7eb;color:#111;font-weight:700;">Amount due</td><td style="padding:8px 0;text-align:right;border-top:2px solid #e5e7eb;color:#16a34a;font-weight:700;font-size:18px;">$${remaining.toFixed(2)}</td></tr>
  </table>
</div>`.trim(),
      });
      sent = true;
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Email failed" },
        { status: 500 },
      );
    }
  }

  if (!sent) {
    return NextResponse.json(
      { error: "No email service configured (set RESEND_API_KEY or QuickBooks creds)" },
      { status: 500 },
    );
  }

  await supabaseAdmin
    .from("sales_orders")
    .update({
      location_remaining_invoice_status: "sent",
      location_remaining_invoice_sent_at: new Date().toISOString(),
      location_remaining_qb_invoice_id: qbInvoiceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "location_remaining_invoiced",
    description: `Remaining-balance invoice sent: $${remaining.toFixed(2)} for ${secured.length} secured location${secured.length === 1 ? "" : "s"} (deposit credit $${depositAmount.toFixed(2)})${body.trigger ? ` [${body.trigger}]` : ""}`,
  });

  return NextResponse.json({
    ok: true,
    remaining,
    total_secured: totalSecuredValue,
    deposit_credit: depositAmount,
    secured_count: secured.length,
    qb_invoice_id: qbInvoiceId,
  });
}
