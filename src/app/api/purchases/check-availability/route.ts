import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** GET /api/purchases/check-availability?requestId=xxx — check if a lead is still available */
export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get("requestId");
  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("lead_purchases")
    .select("id")
    .eq("request_id", requestId)
    .eq("status", "completed")
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const available = !data || data.length === 0;
  return NextResponse.json({ available });
}
