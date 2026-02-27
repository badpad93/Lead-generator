import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createRouteSchema } from "@/lib/schemas";
import { getAdminUserId } from "@/lib/adminAuth";

/** GET /api/admin/routes — list all route listings */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("route_listings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    // Table may not exist yet — return empty
    return NextResponse.json({ routes: [], note: error.message });
  }

  return NextResponse.json({ routes: data || [] });
}

/** POST /api/admin/routes — admin creates a route listing */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
