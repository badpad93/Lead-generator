import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createRequestSchema } from "@/lib/schemas";
import { getAdminUserId } from "@/lib/adminAuth";

/** GET /api/admin/requests — list all requests (admin view) */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const page = Math.max(0, parseInt(params.get("page") || "0"));
  const perPage = Math.min(200, Math.max(1, parseInt(params.get("per_page") || "100")));
  const search = params.get("search") || "";

  let query = supabaseAdmin
    .from("vending_requests")
    .select("*, profiles!created_by(id, full_name, email)", { count: "exact" });

  if (search) {
    query = query.or(`title.ilike.%${search}%,city.ilike.%${search}%,state.ilike.%${search}%,location_name.ilike.%${search}%`);
  }

  const from = page * perPage;
  const to = from + perPage - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data || [], total: count || 0 });
}

/** POST /api/admin/requests — admin creates a location request */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = createRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Admin creates on behalf — use admin's own ID as created_by
    const { data, error } = await supabaseAdmin
      .from("vending_requests")
      .insert({
        created_by: adminId,
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
