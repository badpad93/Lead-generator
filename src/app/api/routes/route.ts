import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createRouteSchema } from "@/lib/schemas";
import { getUserIdFromRequest } from "@/lib/apiAuth";

const PAGE_SIZE = 12;

/** POST /api/routes — authenticated user creates a route listing */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createRouteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("route_listings")
      .insert({
        created_by: userId,
        ...parsed.data,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

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
