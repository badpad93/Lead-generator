import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createMachineListingSchema } from "@/lib/schemas";
import { getAdminUserId } from "@/lib/adminAuth";

/** GET /api/admin/machine-listings — list all machine listings */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("machine_listings")
    .select("*, profiles!created_by(id, full_name, email)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    // Table may not exist yet — return empty
    return NextResponse.json({ listings: [], note: error.message });
  }

  return NextResponse.json({ listings: data || [] });
}

/** POST /api/admin/machine-listings — admin creates a machine listing */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = createMachineListingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("machine_listings")
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
