import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/** GET /api/matches — list matches for the current user */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = req.nextUrl.searchParams.get("role");

  if (role === "operator") {
    // Operator: get matches they applied to
    const { data, error } = await supabaseAdmin
      .from("matches")
      .select("*, vending_requests!inner(id, title, city, state, location_type, status, machine_types_wanted)")
      .neq("vending_requests.city", "").neq("vending_requests.state", "")
      .not("vending_requests.city", "is", null).not("vending_requests.state", "is", null)
      .neq("vending_requests.city", "Unknown").neq("vending_requests.state", "Unknown")
      .neq("vending_requests.city", "unknown").neq("vending_requests.state", "unknown")
      .eq("operator_id", userId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } else {
    // Location manager/requestor: get matches on their requests
    const { data: requests } = await supabaseAdmin
      .from("vending_requests")
      .select("id")
      .eq("created_by", userId);

    const requestIds = requests?.map((r) => r.id) || [];
    if (requestIds.length === 0) return NextResponse.json([]);

    const { data, error } = await supabaseAdmin
      .from("matches")
      .select("*, profiles!operator_id(id, full_name, avatar_url, company_name, verified, rating, review_count), vending_requests(id, title)")
      .in("request_id", requestIds)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }
}

/**
 * POST /api/matches — disabled.
 * Direct communication between operators and locations is not allowed.
 * All requests must go through the admin, or operators can reach out
 * to locations once they purchase the lead.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Direct applications are disabled. Please contact the admin or purchase the lead to connect." },
    { status: 403 }
  );
}

/** PATCH /api/matches — update match status */
export async function PATCH(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { match_id, status } = body;

    if (!match_id || !status) {
      return NextResponse.json({ error: "match_id and status required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("matches")
      .update({ status })
      .eq("id", match_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
