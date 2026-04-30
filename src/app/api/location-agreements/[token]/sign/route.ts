import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
    .select("id, status, lead_id")
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

  return NextResponse.json({ ok: true, status: "signed" });
}
