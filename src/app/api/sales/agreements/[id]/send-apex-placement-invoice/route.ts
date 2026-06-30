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
  const { id } = await params;

  const { data: ag, error } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !ag) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  if (ag.agreement_type !== "location_placement") {
    return NextResponse.json({ error: "Apex Placement Fee only applies to Location Placement Agreements" }, { status: 400 });
  }

  if (ag.apex_placement_invoice_status === "sent" || ag.apex_placement_invoice_status === "paid") {
    return NextResponse.json({ error: "Apex placement invoice has already been sent" }, { status: 400 });
  }

  const amount = Number(ag.apex_placement_fee) || 0;
  if (amount <= 0) {
    return NextResponse.json({ error: "Set the Apex Placement Fee before sending an invoice" }, { status: 400 });
  }

  const recipientEmail = ag.placement_operator_email;
  if (!recipientEmail) {
    return NextResponse.json({ error: "Operator email missing on the agreement" }, { status: 400 });
  }

  const operatorName = ag.placement_operator_company || ag.placement_operator_contact || "Operator";
  const locationName = ag.location_business_name || "Location";

  let qbInvoiceId: string | null = null;
  let qbSent = false;
  const qbConfigured = !!(process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET);

  if (qbConfigured) {
    try {
      const { createInvoice, sendInvoiceEmail } = await import("@/lib/quickbooks");
      const invoice = await Promise.race([
        createInvoice({
          customerEmail: recipientEmail,
          customerName: operatorName,
          customerPhone: ag.placement_operator_phone || undefined,
          lineItems: [{ description: `Location Placement Services — ${locationName}`, amount, quantity: 1 }],
          memo: `Apex Placement Fee — Agreement #${(ag.id || "").slice(0, 8).toUpperCase()}`,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("QB timeout")), 8000)),
      ]);
      qbInvoiceId = invoice.Id;
      await Promise.race([
        sendInvoiceEmail(invoice.Id, recipientEmail),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("QB email timeout")), 5000)),
      ]);
      qbSent = true;
    } catch {
      // Fall through
    }
  }

  if (!qbSent && process.env.RESEND_API_KEY) {
    try {
      await getResend().emails.send({
        from: FROM_EMAIL,
        to: recipientEmail,
        cc: ["james@apexaivending.com"],
        subject: `Invoice — Location Placement Services for ${locationName}`,
        html: `
<div style="max-width:640px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 24px;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="color:#16a34a;font-size:24px;margin:0;">Apex AI Vending</h1>
    <p style="color:#6b7280;font-size:14px;margin:4px 0 0;">Location Placement Services Invoice</p>
  </div>
  <div style="background:#f9fafb;border-radius:12px;padding:24px;margin-bottom:24px;">
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">
      Hello ${ag.placement_operator_contact || operatorName},
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      Per your executed Location Placement Agreement for <strong>${locationName}</strong>, please find your placement services invoice below.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
      <tr style="border-top:2px solid #e5e7eb;">
        <td style="padding:8px 0 0;color:#111;font-weight:700;">Location Placement Services — ${locationName}</td>
        <td style="padding:8px 0 0;text-align:right;color:#16a34a;font-weight:700;font-size:18px;">$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
      </tr>
    </table>
    ${ag.apex_placement_fee_notes ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;"><strong>Notes:</strong> ${ag.apex_placement_fee_notes}</p>` : ""}
  </div>
  <p style="font-size:13px;color:#6b7280;text-align:center;">
    Questions? Contact <a href="mailto:james@apexaivending.com" style="color:#16a34a;">james@apexaivending.com</a>
    or call <a href="tel:+18888511462" style="color:#16a34a;">(888) 851-1462</a>
  </p>
</div>
        `.trim(),
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Email failed" }, { status: 500 });
    }
  } else if (!qbSent) {
    return NextResponse.json({ error: "No email service configured (RESEND_API_KEY or QuickBooks)" }, { status: 500 });
  }

  await supabaseAdmin
    .from("purchase_agreements")
    .update({
      apex_placement_invoice_status: "sent",
      apex_placement_invoice_sent_at: new Date().toISOString(),
      apex_placement_qb_invoice_id: qbInvoiceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: id,
    user_id: user.id,
    activity_type: "apex_placement_invoice_sent",
    description: `Apex Placement Fee invoice ($${amount.toFixed(2)}) sent to ${recipientEmail}`,
  });

  return NextResponse.json({ success: true, amount, sent_to: recipientEmail });
}
