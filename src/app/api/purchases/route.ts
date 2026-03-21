import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/** GET /api/purchases?requestId=xxx — check if the current user has purchased a lead */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);

  const requestId = req.nextUrl.searchParams.get("requestId");
  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }

  // Check if *anyone* has purchased this lead
  const { data: anyPurchase } = await supabaseAdmin
    .from("lead_purchases")
    .select("id")
    .eq("request_id", requestId)
    .eq("status", "completed")
    .maybeSingle();

  const purchasedByAnyone = !!anyPurchase;

  if (!userId) {
    return NextResponse.json({ purchased: false, purchasedByAnyone });
  }

  const { data } = await supabaseAdmin
    .from("lead_purchases")
    .select("id, buyer_email, amount_cents, created_at, stripe_checkout_session_id")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .eq("status", "completed")
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ purchased: false, purchasedByAnyone });
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
    purchasedByAnyone,
    buyerEmail: data.buyer_email,
    leadInfoComplete,
    amountCents: data.amount_cents,
    purchaseDate: data.created_at,
    orderId: data.id,
    stripeSessionId: data.stripe_checkout_session_id,
  });
}
