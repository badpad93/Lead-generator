import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data, error } = await supabaseAdmin
    .from("agreement_tokens")
    .select("id, token, recipient_name, recipient_email, industry, zip, pricing_score, pricing_tier, pricing_price, status, signature_name, signed_at, paid_at, pdf_url, full_details_pdf_url, location_id, created_at, sales_accounts(business_name)")
    .eq("token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (data.status === "pending") {
    await supabaseAdmin
      .from("agreement_tokens")
      .update({ status: "viewed", updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending");
  }

  let location = null;
  if (data.status === "paid" && data.location_id) {
    const { data: loc } = await supabaseAdmin
      .from("locations")
      .select("location_name, address, phone, decision_maker_name, decision_maker_email, industry, zip, employee_count, traffic_count, machine_type, machines_requested, business_hours")
      .eq("id", data.location_id)
      .single();
    location = loc;
  }

  return NextResponse.json({ ...data, location });
}
