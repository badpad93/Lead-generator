import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("signed_agreements")
    .select(
      `id, user_id, user_email, lead_id, purchase_id, agreement_version, full_name, created_at,
       vending_requests!lead_id ( id, title, location_name, city, state ),
       lead_purchases!purchase_id ( id, amount_cents, stripe_checkout_session_id )`
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
