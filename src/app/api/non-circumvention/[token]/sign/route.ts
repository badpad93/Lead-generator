import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendSignedCopyToAdmin } from "@/lib/nonCircumvention";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();
  const {
    signature_name,
    operator_name,
    company_name,
    email,
    phone,
    address,
    confirm_confidential,
    confirm_no_circumvent,
    confirm_consequences,
  } = body;

  if (!signature_name || typeof signature_name !== "string" || signature_name.trim().length < 2) {
    return NextResponse.json({ error: "Please type your full name to sign" }, { status: 400 });
  }

  if (!confirm_confidential || !confirm_no_circumvent || !confirm_consequences) {
    return NextResponse.json({ error: "Please confirm all checkboxes before signing" }, { status: 400 });
  }

  const { data: agreement } = await supabaseAdmin
    .from("non_circumvention_agreements")
    .select("id, status, lead_id")
    .eq("token", token)
    .single();

  if (!agreement) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (agreement.status === "signed") {
    return NextResponse.json({ ok: true, status: "signed" });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const signedAt = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("non_circumvention_agreements")
    .update({
      status: "signed",
      operator_name: operator_name?.trim() || null,
      company_name: company_name?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      signature_name: signature_name.trim(),
      signature_ip: ip,
      signed_at: signedAt,
      confirm_confidential,
      confirm_no_circumvent,
      confirm_consequences,
      updated_at: signedAt,
    })
    .eq("id", agreement.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (agreement.lead_id) {
    const leadUpdates: Record<string, unknown> = {};
    if (operator_name?.trim()) leadUpdates.contact_name = operator_name.trim();
    if (company_name?.trim()) leadUpdates.business_name = company_name.trim();
    if (email?.trim()) leadUpdates.email = email.trim();
    if (phone?.trim()) leadUpdates.phone = phone.trim();
    if (address?.trim()) leadUpdates.address = address.trim();
    if (Object.keys(leadUpdates).length > 0) {
      await supabaseAdmin.from("sales_leads").update(leadUpdates).eq("id", agreement.lead_id);
    }

    const { data: lead } = await supabaseAdmin
      .from("sales_leads")
      .select("account_id")
      .eq("id", agreement.lead_id)
      .single();

    if (lead?.account_id) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";
      try {
        await supabaseAdmin.from("sales_documents").insert({
          account_id: lead.account_id,
          file_url: `${appUrl}/non-circumvention/${token}`,
          file_name: `Non-Circumvention Agreement — ${company_name?.trim() || operator_name?.trim() || "Signed"}`,
          type: "non_circumvention",
        });
      } catch {
        // Non-critical — document link is optional
      }
    }
  }

  try {
    await sendSignedCopyToAdmin({
      operator_name: operator_name?.trim() || null,
      company_name: company_name?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      signature_name: signature_name.trim(),
      signed_at: signedAt,
      signature_ip: ip,
    });
  } catch (err) {
    console.error("[non-circumvention] Failed to email signed copy to admin:", err);
  }

  return NextResponse.json({ ok: true, status: "signed" });
}
