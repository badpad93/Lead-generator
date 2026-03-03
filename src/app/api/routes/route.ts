import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PAGE_SIZE = 12;

/** GET /api/routes — list active route listings with filters */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const search = params.get("search");
  const state = params.get("state");
  const page = Math.max(0, parseInt(params.get("page") || "0"));

  let query = supabaseAdmin
    .from("route_listings")
    .select("*, profiles!created_by(id, full_name, avatar_url, company_name, verified)", { count: "exact" })
    .eq("status", "active");

  if (search) {
    query = query.or(`city.ilike.%${search}%,state.ilike.%${search}%,title.ilike.%${search}%`);
  }
  if (state) query = query.eq("state", state);

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ routes: data || [], total: count || 0 });
}
