import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const ALWAYS_CC = [
  "james@apexaivending.com",
  "katrina.cacdac@apexaivending.com",
];

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

/* ------------------------------------------------------------------ */
/*  POST — Send agreement to operator via email                       */
/* ------------------------------------------------------------------ */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Email service not configured (RESEND_API_KEY missing)" },
      { status: 500 },
    );
  }

  // Fetch agreement
  const { data: agreement, error: agErr } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", id)
    .single();

  if (agErr || !agreement)
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  // Validate required fields. Equipment fields are only required when
  // the Equipment section is included.
  const includeEquipment = agreement.include_equipment !== false;
  const requiredFields: Array<{ key: string; label: string }> = [
    { key: "operator_company_name", label: "Operator company name" },
    { key: "operator_legal_name", label: "Operator legal name" },
    { key: "operator_email", label: "Operator email" },
    { key: "effective_date", label: "Effective date" },
    { key: "apex_representative_name", label: "Apex representative name" },
  ];
  if (includeEquipment) {
    requiredFields.push(
      { key: "machine_model", label: "Machine model" },
      { key: "machine_quantity", label: "Machine quantity" },
      { key: "machine_unit_price", label: "Machine unit price" },
    );
  }

  const missing = requiredFields.filter(
    (f) =>
      !agreement[f.key] ||
      (typeof agreement[f.key] === "string" &&
        agreement[f.key].trim() === ""),
  );

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Missing required fields: ${missing.map((m) => m.label).join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Build signing URL
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
  const signingUrl = `${siteUrl}/sign/${agreement.sign_token}`;

  // Build CC list
  const ccEmails: string[] = [];
  if (
    agreement.apex_representative_email &&
    agreement.apex_representative_email !== agreement.operator_email
  ) {
    ccEmails.push(agreement.apex_representative_email);
  }
  for (const addr of ALWAYS_CC) {
    if (!ccEmails.includes(addr) && addr !== agreement.operator_email) {
      ccEmails.push(addr);
    }
  }

  // Build email HTML
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#111827;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#16a34a;font-size:22px;margin:0;">Apex AI Vending</h1>
    <p style="color:#6b7280;font-size:14px;margin:8px 0 0;">VendEra AI Machine Purchase &amp; Services Agreement</p>
  </div>

  <p>Hi ${agreement.operator_legal_name || agreement.operator_company_name},</p>

  <p>Your purchase agreement is ready for review and signature.</p>

  <p>This agreement covers:</p>
  <ul style="color:#374151;line-height:1.8;">
    ${includeEquipment && agreement.machine_quantity > 0 ? `<li>Equipment: ${agreement.machine_quantity}x ${agreement.machine_model} @ $${Number(agreement.machine_unit_price).toLocaleString("en-US", { minimumFractionDigits: 2 })} each</li>` : ""}
    ${agreement.include_location_services !== false && Number(agreement.locations_purchased) > 0 ? `<li>Location Services: ${agreement.locations_purchased} location${agreement.locations_purchased > 1 ? "s" : ""} @ $${Number(agreement.location_fee_per_secured || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} each</li>` : ""}
    ${agreement.include_shipping_storage !== false && Number(agreement.freight_total) > 0 ? `<li>Shipping &amp; Freight: $${Number(agreement.freight_total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</li>` : ""}
    <li>Total Due Prior to Procurement: <strong>$${Number(agreement.total_due_prior_to_procurement || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></li>
  </ul>

  <div style="text-align:center;margin:32px 0;">
    <a href="${signingUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:16px;">Review &amp; Sign Agreement</a>
  </div>

  <p style="font-size:13px;color:#6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
  <p style="font-size:12px;word-break:break-all;color:#16a34a;">${signingUrl}</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;"/>

  <p style="font-size:13px;color:#6b7280;">This agreement was prepared by ${agreement.apex_representative_name} at Apex AI Vending. If you have questions, please reply to this email or contact your representative directly.</p>

  <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:32px;">Apex AI Vending &bull; vendingconnector.com</p>
</body>
</html>`.trim();

  // Send email
  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: agreement.operator_email,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject:
        "Your VendEra AI Machine Purchase & Services Agreement",
      html,
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message || String(result.error) },
        { status: 500 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Email send failed: ${msg}` }, { status: 500 });
  }

  // Update agreement status
  await supabaseAdmin
    .from("purchase_agreements")
    .update({
      agreement_status: "sent",
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Log activity
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: id,
    user_id: user.id,
    activity_type: "sent",
    description: `Agreement emailed to ${agreement.operator_email}${ccEmails.length > 0 ? ` (CC: ${ccEmails.join(", ")})` : ""}`,
  });

  return NextResponse.json({ ok: true, emailSent: true });
}
