import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createMachineListingSchema } from "@/lib/schemas";
import { getUserIdFromRequest } from "@/lib/apiAuth";

const PAGE_SIZE = 12;

/** POST /api/machine-listings — authenticated user creates a machine listing */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        created_by: userId,
        ...parsed.data,
        status: "pending", // All user submissions require admin approval
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

/** GET /api/machine-listings — list active machine listings with filters */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const search = params.get("search");
  const state = params.get("state");
  const machineType = params.get("machine_type");
  const condition = params.get("condition");
  const page = Math.max(0, parseInt(params.get("page") || "0"));

  let query = supabaseAdmin
    .from("machine_listings")
    .select("*, profiles!created_by(id, full_name, company_name, verified)", {
      count: "exact",
    })
    .eq("status", "active");

  // Exclude locations with missing or unknown city/state
  query = query
    .neq("city", "")
    .neq("state", "")
    .not("city", "is", null)
    .not("state", "is", null)
    .neq("city", "Unknown")
    .neq("state", "Unknown")
    .neq("city", "unknown")
    .neq("state", "unknown");

  if (search) {
    query = query.or(
      `city.ilike.%${search}%,state.ilike.%${search}%,title.ilike.%${search}%,machine_make.ilike.%${search}%,machine_model.ilike.%${search}%`
    );
  }
  if (state) query = query.eq("state", state);
  if (machineType) query = query.eq("machine_type", machineType);
  if (condition) query = query.eq("condition", condition);

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Strip sensitive contact info from list view
  const sanitized = (data || []).map((row) => {
    const {
      contact_email: _e,
      contact_phone: _p,
      created_by: _c,
      ...rest
    } = row as Record<string, unknown>;
    void _e;
    void _p;
    void _c;
    return rest;
  });

  return NextResponse.json({ listings: sanitized, total: count || 0 });
}
