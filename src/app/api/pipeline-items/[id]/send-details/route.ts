import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { generateSiteDetailsPdf } from "@/lib/pdf/agreementPdf";
import { sendFullSiteDetailsEmail } from "@/lib/agreementEmail";
import { PricingResult } from "@/lib/pricing/locationPricing";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: itemId } = await params;

  let emailOverride: string | null = null;
  try {
    const body = await req.json();
    emailOverride = body.email || null;
  } catch {
    // No body
  }

  const { data: item } = await supabaseAdmin
    .from("pipeline_items")
    .select("id, location_id, proposal_status, sales_accounts(id, business_name, contact_name, email)")
    .eq("id", itemId)
    .single();

  if (!item) {
    return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
  }

  if (!item.location_id) {
    return NextResponse.json({ error: "No location linked to this pipeline item" }, { status: 400 });
  }

  const account = item.sales_accounts as unknown as { id: string; business_name: string; contact_name: string; email: string } | null;
  const recipientEmail = emailOverride || account?.email;
  if (!recipientEmail) {
    return NextResponse.json({ error: "No email found — provide one in the request body" }, { status: 400 });
  }

  const { data: agreement } = await supabaseAdmin
    .from("agreement_tokens")
    .select("id, pricing_score, pricing_tier, pricing_price, recipient_name")
    .eq("pipeline_item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", item.location_id)
    .single();

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  let locationAgreement: {
    signature_name: string | null;
    signed_at: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    title_role: string | null;
  } | null = null;

  if (location.sales_lead_id) {
    const { data: la } = await supabaseAdmin
      .from("location_agreements")
      .select("signature_name, signed_at, contact_name, email, phone, title_role")
      .eq("lead_id", location.sales_lead_id)
      .eq("status", "signed")
      .maybeSingle();
    locationAgreement = la;
  }

  const pricing: PricingResult = {
    total_score: agreement?.pricing_score ?? 0,
    traffic_score: 0,
    hours_score: 0,
    machine_score: 0,
    tier: (agreement?.pricing_tier as 1 | 2 | 3 | 4 | 5) ?? 3,
    tier_label: `Tier ${agreement?.pricing_tier ?? 3}`,
    price: Number(agreement?.pricing_price ?? 0),
  };

  const pdfBytes = await generateSiteDetailsPdf({
    businessName: account?.business_name || agreement?.recipient_name || "",
    contactName: account?.contact_name || agreement?.recipient_name || "",
    locationName: location.location_name || "",
    address: location.address || "",
    phone: location.phone || "",
    decisionMakerName: location.decision_maker_name || "",
    decisionMakerEmail: location.decision_maker_email || "",
    industry: location.industry || "",
    zip: location.zip || "",
    employeeCount: location.employee_count || 0,
    trafficCount: location.traffic_count || 0,
    machineType: location.machine_type || "",
    machinesRequested: location.machines_requested || 1,
    businessHours: location.business_hours || "",
    pricing,
    generatedAt: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    locationAgreement: locationAgreement
      ? {
          signatureName: locationAgreement.signature_name || "",
          signedAt: locationAgreement.signed_at || "",
          contactName: locationAgreement.contact_name || "",
          titleRole: locationAgreement.title_role || "",
          email: locationAgreement.email || "",
          phone: locationAgreement.phone || "",
        }
      : undefined,
  });

  await sendFullSiteDetailsEmail({
    to: recipientEmail,
    recipientName: account?.contact_name || agreement?.recipient_name || "",
    businessName: account?.business_name || "",
    locationName: location.location_name || "Location",
    pdfBuffer: pdfBytes,
    locationAgreement: locationAgreement
      ? {
          signatureName: locationAgreement.signature_name || "",
          signedAt: locationAgreement.signed_at || "",
          contactName: locationAgreement.contact_name || "",
          email: locationAgreement.email || "",
          phone: locationAgreement.phone || "",
        }
      : undefined,
  });

  return NextResponse.json({ ok: true, sent_to: recipientEmail });
}
