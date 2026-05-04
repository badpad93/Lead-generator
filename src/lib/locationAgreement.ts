import { supabaseAdmin } from "./supabaseAdmin";
import { sendLocationAgreementEmail } from "./locationAgreementEmail";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";

export async function createAndSendAgreement(
  leadId: string,
  lead: {
    business_name?: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    title_role?: string;
  },
  options?: { force?: boolean }
) {
  if (!lead.email) {
    console.warn(`[location-agreement] Skipped lead ${leadId}: no email provided`);
    return;
  }

  const existing = await supabaseAdmin
    .from("location_agreements")
    .select("id, token")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existing.data && !options?.force) {
    console.log(`[location-agreement] Skipped lead ${leadId}: agreement already exists (${existing.data.id}). Use force=true to resend.`);
    return;
  }

  if (existing.data && options?.force) {
    console.log(`[location-agreement] Force resending agreement for lead ${leadId}`);
    await sendLocationAgreementEmail({
      to: lead.email,
      recipientName: lead.contact_name || "Business Owner",
      businessName: lead.business_name || "your location",
      agreementUrl: `${APP_URL}/location-agreement/${existing.data.token}`,
    });
    console.log(`[location-agreement] Resent agreement email to ${lead.email} for lead ${leadId}`);
    return;
  }

  const { data: agreement } = await supabaseAdmin
    .from("location_agreements")
    .insert({
      lead_id: leadId,
      business_name: lead.business_name || null,
      contact_name: lead.contact_name || null,
      email: lead.email,
      phone: lead.phone || null,
      address: lead.address || null,
    })
    .select("token")
    .single();

  if (!agreement) {
    console.error(`[location-agreement] Failed to create agreement record for lead ${leadId}`);
    return;
  }

  await sendLocationAgreementEmail({
    to: lead.email,
    recipientName: lead.contact_name || "Business Owner",
    businessName: lead.business_name || "your location",
    agreementUrl: `${APP_URL}/location-agreement/${agreement.token}`,
  });

  console.log(`[location-agreement] Sent agreement email to ${lead.email} for lead ${leadId}`);
}
