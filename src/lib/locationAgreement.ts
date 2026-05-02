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
  }
) {
  if (!lead.email) return;

  const existing = await supabaseAdmin
    .from("location_agreements")
    .select("id")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (existing.data) return;

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

  if (!agreement) return;

  await sendLocationAgreementEmail({
    to: lead.email,
    recipientName: lead.contact_name || "Business Owner",
    businessName: lead.business_name || "your location",
    agreementUrl: `${APP_URL}/location-agreement/${agreement.token}`,
  });
}
