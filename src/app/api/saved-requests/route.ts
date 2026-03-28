import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** GET /api/saved-requests — list current user's saved request IDs */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("saved_requests")
    .select("request_id, created_at, vending_requests!request_id ( id, title, city, state, price, location_type, machine_types_wanted, urgency, commission_offered, estimated_daily_traffic, status, created_at, is_public, views, created_by )")
    .eq("operator_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/** POST /api/saved-requests — save a request */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requestId } = await req.json();
  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("saved_requests")
    .upsert(
      { operator_id: userId, request_id: requestId },
      { onConflict: "operator_id,request_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}

/** DELETE /api/saved-requests — unsave a request */
export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requestId } = await req.json();
  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("saved_requests")
    .delete()
    .eq("operator_id", userId)
    .eq("request_id", requestId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: false });
}
