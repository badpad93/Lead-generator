import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** GET /api/matches — list matches for the current user */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = req.nextUrl.searchParams.get("role");

  if (role === "operator") {
    // Operator: get matches they applied to
    const { data, error } = await supabaseAdmin
      .from("matches")
      .select("*, vending_requests(id, title, city, state, location_type, status, machine_types_wanted)")
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

/** POST /api/matches — operator applies to a request */
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { request_id, notes } = body;

    if (!request_id) {
      return NextResponse.json({ error: "request_id is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("matches")
      .insert({
        request_id,
        operator_id: userId,
        matched_by: "operator_applied",
        status: "pending",
        notes: notes || null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "You have already applied to this request" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PATCH /api/matches — update match status */
export async function PATCH(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
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
