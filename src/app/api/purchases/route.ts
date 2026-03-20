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
    .select("id")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .eq("status", "completed")
    .maybeSingle();

  return NextResponse.json({ purchased: !!data });
}
