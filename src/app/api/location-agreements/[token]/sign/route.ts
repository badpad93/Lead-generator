import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendListingPendingApprovalEmail } from "@/lib/locationAgreementEmail";
import { sendAgreementSignedNotification } from "@/lib/agreementEmail";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();
  const {
    signature_name,
    business_name,
    contact_name,
    title_role,
    email,
    phone,
    address,
    confirm_accurate,
    confirm_authorized,
    confirm_agree,
  } = body;

  if (!signature_name || typeof signature_name !== "string" || signature_name.trim().length < 2) {
    return NextResponse.json({ error: "Please type your full name to sign" }, { status: 400 });
  }

  if (!confirm_accurate || !confirm_authorized || !confirm_agree) {
    return NextResponse.json({ error: "Please confirm all checkboxes before signing" }, { status: 400 });
  }

  const { data: agreement } = await supabaseAdmin
    .from("location_agreements")
    .select("id, status, lead_id, listing_id")
    .eq("token", token)
    .single();

  if (!agreement) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (agreement.status === "signed") {
    return NextResponse.json({ ok: true, status: "signed" });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

  const { error } = await supabaseAdmin
    .from("location_agreements")
    .update({
      status: "signed",
      business_name: business_name?.trim() || null,
      contact_name: contact_name?.trim() || null,
      title_role: title_role?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      signature_name: signature_name.trim(),
      signature_ip: ip,
      signed_at: new Date().toISOString(),
      confirm_accurate,
      confirm_authorized,
      confirm_agree,
      updated_at: new Date().toISOString(),
    })
    .eq("id", agreement.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update the lead with any corrected contact info from the signer
  if (agreement.lead_id) {
    const leadUpdates: Record<string, unknown> = {};
    if (contact_name?.trim()) leadUpdates.contact_name = contact_name.trim();
    if (email?.trim()) leadUpdates.email = email.trim();
    if (phone?.trim()) leadUpdates.phone = phone.trim();
    if (address?.trim()) leadUpdates.address = address.trim();
    if (Object.keys(leadUpdates).length > 0) {
      await supabaseAdmin.from("sales_leads").update(leadUpdates).eq("id", agreement.lead_id);
    }
  }

  // Create a sales_documents record so the signed agreement shows in the CRM account
  if (agreement.lead_id) {
    const { data: lead } = await supabaseAdmin
      .from("sales_leads")
      .select("account_id")
      .eq("id", agreement.lead_id)
      .single();

    if (lead?.account_id) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";
      await supabaseAdmin.from("sales_documents").insert({
        account_id: lead.account_id,
        file_url: `${appUrl}/location-agreement/${token}`,
        file_name: `Location Agreement — ${business_name?.trim() || "Signed"}`,
        type: "location_agreement",
      });
    }
  }

  // Move listing to pending_approval so admin can review before it goes live
  if (agreement.listing_id) {
    const { error: updateErr } = await supabaseAdmin
      .from("user_listings")
      .update({
        status: "pending_approval",
        updated_at: new Date().toISOString(),
      })
      .eq("id", agreement.listing_id)
      .eq("status", "pending_verification");

    if (updateErr) {
      console.error("[location-agreement] Failed to update listing status:", updateErr);
    }

    const { data: listing } = await supabaseAdmin
      .from("user_listings")
      .select("title, city, state, price, listing_type, profiles!seller_id(full_name, email)")
      .eq("id", agreement.listing_id)
      .single();

    if (listing) {
      const sellerProfile = listing.profiles as unknown as { full_name: string; email: string } | null;
      try {
        await sendListingPendingApprovalEmail({
          listingTitle: listing.title,
          listingType: listing.listing_type,
          sellerName: sellerProfile?.full_name || "Unknown",
          sellerEmail: sellerProfile?.email || "",
          city: listing.city || "",
          state: listing.state || "",
          price: Number(listing.price),
        });
      } catch (emailErr) {
        console.error("[location-agreement] Failed to send approval notification:", emailErr);
      }
    }
  }

  // Notify admin that location agreement was signed
  try {
    await sendAgreementSignedNotification({
      type: "location",
      signatureName: signature_name.trim(),
      recipientName: contact_name?.trim() || signature_name.trim(),
      recipientEmail: email?.trim() || "",
      businessName: business_name?.trim() || "",
      signedAt: new Date().toISOString(),
    });
  } catch (emailErr) {
    console.error("[location-agreement] Failed to send admin notification:", emailErr);
  }

  return NextResponse.json({ ok: true, status: "signed" });
}
