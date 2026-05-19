import { Resend } from "resend";
import { supabaseAdmin } from "./supabaseAdmin";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || "sales@bytebitevending.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";
const ADMIN_EMAIL = "james@apexaivending.com";

export async function createAndSendNonCircumvention(
  leadId: string,
  lead: {
    business_name?: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    address?: string;
  },
  options?: { force?: boolean }
) {
  if (!lead.email) {
    console.warn(`[non-circumvention] Skipped lead ${leadId}: no email`);
    return;
  }

  const existing = await supabaseAdmin
    .from("non_circumvention_agreements")
    .select("id, token")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existing.data && !options?.force) {
    console.log(`[non-circumvention] Skipped lead ${leadId}: agreement exists`);
    return;
  }

  const agreementUrl = existing.data
    ? `${APP_URL}/non-circumvention/${existing.data.token}`
    : null;

  if (existing.data && options?.force && agreementUrl) {
    await sendNonCircumventionEmail({
      to: lead.email,
      recipientName: lead.contact_name || "Operator",
      agreementUrl,
    });
    return;
  }

  const { data: agreement } = await supabaseAdmin
    .from("non_circumvention_agreements")
    .insert({
      lead_id: leadId,
      operator_name: lead.contact_name || null,
      company_name: lead.business_name || null,
      email: lead.email,
      phone: lead.phone || null,
      address: lead.address || null,
    })
    .select("token")
    .single();

  if (!agreement) {
    console.error(`[non-circumvention] Failed to create record for lead ${leadId}`);
    return;
  }

  await sendNonCircumventionEmail({
    to: lead.email,
    recipientName: lead.contact_name || "Operator",
    agreementUrl: `${APP_URL}/non-circumvention/${agreement.token}`,
  });

  console.log(`[non-circumvention] Sent to ${lead.email} for lead ${leadId}`);
}

async function sendNonCircumventionEmail(params: {
  to: string;
  recipientName: string;
  agreementUrl: string;
}) {
  const { to, recipientName, agreementUrl } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Non-Circumvention Agreement — Please Sign to Receive Location Details",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Apex AI Vending</span>
        </div>
        <p style="color:#111827;font-size:15px;line-height:1.6;">
          Hi ${recipientName},
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          We completely understand your apprehension — and we want to make sure you feel comfortable before we share any confidential location details.
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Please sign our Site Walkthrough Non-Circumvention &amp; Confidentiality Agreement below. Once signed, we'll be able to share the full location information with you right away.
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          This agreement simply protects both parties and ensures a fair process for everyone involved.
        </p>
        <div style="margin:24px 0;">
          <a href="${agreementUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
            Review &amp; Sign Agreement
          </a>
        </div>
        <p style="color:#9ca3af;font-size:12px;">
          You can also access the agreement at:<br>
          <a href="${agreementUrl}" style="color:#16a34a;">${agreementUrl}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Apex AI Vending — vendingconnector.com</p>
      </div>
    `,
  });
}

export async function sendSignedCopyToAdmin(agreement: {
  operator_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  signature_name: string;
  signed_at: string;
  signature_ip: string;
}) {
  const signed = new Date(agreement.signed_at).toLocaleString("en-US", {
    timeZone: "America/New_York",
  });

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `Non-Circumvention Agreement Signed — ${agreement.company_name || agreement.operator_name || "Unknown"}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Apex AI Vending</span>
        </div>
        <p style="color:#111827;font-size:15px;font-weight:600;">
          Non-Circumvention Agreement Signed
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:140px;">Operator Name</td><td style="padding:8px 0;color:#111827;font-size:14px;">${agreement.operator_name || "—"}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Company</td><td style="padding:8px 0;color:#111827;font-size:14px;">${agreement.company_name || "—"}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Email</td><td style="padding:8px 0;color:#111827;font-size:14px;">${agreement.email || "—"}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Phone</td><td style="padding:8px 0;color:#111827;font-size:14px;">${agreement.phone || "—"}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Address</td><td style="padding:8px 0;color:#111827;font-size:14px;">${agreement.address || "—"}</td></tr>
          <tr style="border-top:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;font-size:13px;">Signature</td><td style="padding:8px 0;color:#111827;font-size:16px;font-style:italic;font-family:serif;">${agreement.signature_name}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Signed At</td><td style="padding:8px 0;color:#111827;font-size:14px;">${signed}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">IP Address</td><td style="padding:8px 0;color:#111827;font-size:14px;">${agreement.signature_ip}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Apex AI Vending — vendingconnector.com</p>
      </div>
    `,
  });
}
