import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data, error } = await supabaseAdmin
    .from("agreement_tokens")
    .select("id, token, recipient_name, recipient_email, industry, zip, pricing_score, pricing_tier, pricing_price, status, signature_name, signed_at, paid_at, pdf_url, created_at, sales_accounts(business_name)")
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

  return NextResponse.json(data);
}
