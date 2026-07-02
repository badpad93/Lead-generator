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

  // Optional body: { target: "location" | "operator" }. Location-placement
  // agreements let the rep choose between the two — some locations don't
  // sign (letter of authorization, verbal approval, etc.) and the operator
  // is the party who signs on the deal.
  const body = await req.json().catch(() => ({}));
  const targetChoice = body.target === "operator" ? "operator" : "location";

  // Fetch agreement
  const { data: agreement, error: agErr } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", id)
    .single();

  if (agErr || !agreement)
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  const isLocationPlacement = agreement.agreement_type === "location_placement";
  const includeEquipment = agreement.include_equipment !== false;
  const sendToOperator = isLocationPlacement && targetChoice === "operator";

  let requiredFields: Array<{ key: string; label: string }>;
  if (isLocationPlacement && sendToOperator) {
    // Sending directly to the operator — no location contact info required.
    requiredFields = [
      { key: "location_business_name", label: "Location business name" },
      { key: "placement_operator_company", label: "Operator company name" },
      { key: "placement_operator_email", label: "Operator email" },
      { key: "effective_date", label: "Effective date" },
    ];
  } else if (isLocationPlacement) {
    requiredFields = [
      { key: "location_business_name", label: "Location business name" },
      { key: "location_contact_name", label: "Location contact name" },
      { key: "location_contact_email", label: "Location contact email" },
      { key: "placement_operator_company", label: "Operator company name" },
      { key: "placement_operator_email", label: "Operator email" },
      { key: "effective_date", label: "Effective date" },
    ];
  } else {
    requiredFields = [
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

  // Determine recipient and CCs based on agreement type + target choice.
  let recipientEmail: string | null;
  if (sendToOperator) {
    recipientEmail = agreement.placement_operator_email;
  } else if (isLocationPlacement) {
    recipientEmail = agreement.location_contact_email;
  } else {
    recipientEmail = agreement.operator_email;
  }

  const ccEmails: string[] = [];
  if (isLocationPlacement) {
    // Rep always gets CC during initial send (they're the sales owner).
    if (agreement.rep_email && agreement.rep_email !== recipientEmail) {
      ccEmails.push(agreement.rep_email);
    }
    // When sending to operator, also CC the location contact if we have one —
    // keeps everyone in the loop even though the location isn't the signer.
    if (
      sendToOperator &&
      agreement.location_contact_email &&
      agreement.location_contact_email !== recipientEmail &&
      !ccEmails.includes(agreement.location_contact_email)
    ) {
      ccEmails.push(agreement.location_contact_email);
    }
  } else {
    if (
      agreement.apex_representative_email &&
      agreement.apex_representative_email !== recipientEmail
    ) {
      ccEmails.push(agreement.apex_representative_email);
    }
    for (const addr of ALWAYS_CC) {
      if (!ccEmails.includes(addr) && addr !== recipientEmail) {
        ccEmails.push(addr);
      }
    }
  }

  // Build email HTML
  const placementGreetingName = sendToOperator
    ? (agreement.placement_operator_contact_name || agreement.placement_operator_company || "there")
    : (agreement.location_contact_name || agreement.location_business_name);
  const placementIntro = sendToOperator
    ? `Please review and sign the location placement agreement below. This agreement covers placement of ${agreement.placement_machine_count || 1} ${agreement.placement_machine_type || "VendEra AI Machine"}${(agreement.placement_machine_count || 1) === 1 ? "" : "s"} at <strong>${agreement.location_business_name}</strong>.`
    : `Please review and sign the location placement agreement below. This agreement covers placement of ${agreement.placement_machine_count || 1} ${agreement.placement_machine_type || "VendEra AI Machine"}${(agreement.placement_machine_count || 1) === 1 ? "" : "s"} at <strong>${agreement.location_business_name}</strong>.`;

  const html = isLocationPlacement ? `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#111827;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#16a34a;font-size:22px;margin:0;">${agreement.placement_operator_company || "Vending Operator"}</h1>
    <p style="color:#6b7280;font-size:14px;margin:8px 0 0;">Location Placement Agreement</p>
  </div>

  <p>Hi ${placementGreetingName},</p>

  <p>${placementIntro}</p>

  <p>This agreement covers:</p>
  <ul style="color:#374151;line-height:1.8;">
    <li>${agreement.placement_machine_count || 1} machine${(agreement.placement_machine_count || 1) === 1 ? "" : "s"} placed at your location at no cost</li>
    <li>Term length: ${agreement.placement_term_months || 24} months</li>
    ${agreement.commission_type === "revenue_share" ? `<li>Compensation: <strong>${Number(agreement.commission_pct || 0).toFixed(1)}% revenue share</strong> (${agreement.commission_payout_schedule || "monthly"})</li>` : ""}
    ${agreement.commission_type === "flat_monthly" ? `<li>Compensation: <strong>$${Number(agreement.commission_monthly_fee || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}/month</strong></li>` : ""}
    <li>Operator handles installation, restocking, and maintenance</li>
  </ul>

  <div style="text-align:center;margin:32px 0;">
    <a href="${signingUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:16px;">Review &amp; Sign Agreement</a>
  </div>

  <p style="font-size:13px;color:#6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
  <p style="font-size:12px;word-break:break-all;color:#16a34a;">${signingUrl}</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;"/>

  <p style="font-size:13px;color:#6b7280;">Questions? Reply to this email and ${agreement.rep_name || "your sales rep"} will get back to you.</p>

  <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:32px;">${agreement.placement_operator_company || "Vending Operator"}</p>
</body>
</html>`.trim() : `
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

  if (!recipientEmail) {
    const missingLabel = sendToOperator
      ? "Operator email is required"
      : isLocationPlacement
        ? "Location contact email is required"
        : "Operator email is required";
    return NextResponse.json({ error: missingLabel }, { status: 400 });
  }

  const subject = isLocationPlacement
    ? `Location Placement Agreement — ${agreement.location_business_name || "Your Location"}`
    : "Your VendEra AI Machine Purchase & Services Agreement";

  // Send email
  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject,
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
  const audience = sendToOperator ? "operator" : isLocationPlacement ? "location" : "operator";
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: id,
    user_id: user.id,
    activity_type: "sent",
    description: `Agreement emailed to ${audience} at ${recipientEmail}${ccEmails.length > 0 ? ` (CC: ${ccEmails.join(", ")})` : ""}`,
  });

  return NextResponse.json({ ok: true, emailSent: true });
}
