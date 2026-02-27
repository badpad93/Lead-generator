import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createListingSchema } from "@/lib/schemas";
import { getAdminUserId } from "@/lib/adminAuth";

/** GET /api/admin/operators — list all operator listings (admin view) */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("operator_listings")
    .select("*, profiles!operator_id(id, full_name, email)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ listings: data || [] });
}

/** POST /api/admin/operators — admin creates an operator listing */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = createListingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Admin creates on behalf — use admin's own ID as operator_id
    const { data, error } = await supabaseAdmin
      .from("operator_listings")
      .insert({
        operator_id: adminId,
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
