import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** GET /api/receipt?requestId=xxx — return receipt data for PDF generation */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  const requestId = req.nextUrl.searchParams.get("requestId");
  if (!requestId) {
    return NextResponse.json(
      { error: "requestId required" },
      { status: 400 }
    );
  }

  // Fetch completed purchase for this user + request
  const { data: purchase } = await supabaseAdmin
    .from("lead_purchases")
    .select("id, amount_cents, currency, buyer_email, created_at")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .eq("status", "completed")
    .maybeSingle();

  if (!purchase) {
    return NextResponse.json(
      { error: "No completed purchase found" },
      { status: 404 }
    );
  }

  // Fetch lead info
  const { data: lead } = await supabaseAdmin
    .from("vending_requests")
    .select("title, city, state")
    .eq("id", requestId)
    .single();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({
    orderId: purchase.id,
    leadTitle: lead.title,
    leadLocation: `${lead.city}, ${lead.state}`,
    purchaseDate: purchase.created_at,
    amountCents: purchase.amount_cents,
    currency: purchase.currency,
    buyerEmail: purchase.buyer_email,
  });
}
