import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/** GET /api/purchases?requestId=xxx — check if the current user has purchased a lead */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ purchased: false });
  }

  const requestId = req.nextUrl.searchParams.get("requestId");
  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }

  const { data } = await supabaseAdmin
    .from("lead_purchases")
    .select("id, buyer_email")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .eq("status", "completed")
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ purchased: false });
  }

  // Check if the lead has all contact fields populated
  const { data: lead } = await supabaseAdmin
    .from("vending_requests")
    .select("contact_phone, address, decision_maker_name, contact_email")
    .eq("id", requestId)
    .single();

  const leadInfoComplete = !!(
    lead?.contact_phone &&
    lead?.address &&
    lead?.decision_maker_name &&
    lead?.contact_email
  );

  return NextResponse.json({
    purchased: true,
    buyerEmail: data.buyer_email,
    leadInfoComplete,
  });
}
