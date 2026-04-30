import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data, error } = await supabaseAdmin
    .from("location_agreements")
    .select("id, token, business_name, contact_name, title_role, email, phone, address, status, signature_name, signed_at, confirm_accurate, confirm_authorized, confirm_agree, created_at")
    .eq("token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (data.status === "pending") {
    await supabaseAdmin
      .from("location_agreements")
      .update({ status: "viewed", updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending");
  }

  return NextResponse.json(data);
}
