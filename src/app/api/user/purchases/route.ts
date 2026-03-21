import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/** GET /api/user/purchases — return all leads purchased by the current user */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: purchases, error } = await supabaseAdmin
    .from("lead_purchases")
    .select(
      "id, request_id, amount_cents, created_at, vending_requests(id, title, city, state, machine_types_wanted, location_type)"
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch purchases" }, { status: 500 });
  }

  return NextResponse.json({ purchases: purchases ?? [] });
}
