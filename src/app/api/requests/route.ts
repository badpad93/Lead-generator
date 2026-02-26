import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createRequestSchema } from "@/lib/schemas";
import { getUserIdFromRequest } from "@/lib/apiAuth";

const PAGE_SIZE = 12;

/** GET /api/requests — list vending requests with filters */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const search = params.get("search");
  const locationType = params.get("location_type");
  const state = params.get("state");
  const urgency = params.get("urgency");
  const commission = params.get("commission");
  const status = params.get("status");
  const machineTypes = params.get("machine_types");
  const page = Math.max(0, parseInt(params.get("page") || "0"));
  const mine = params.get("mine");
  const saved = params.get("saved");
  const userId = params.get("user_id");

  let query = supabaseAdmin
    .from("vending_requests")
    .select("*, profiles!created_by(id, full_name, avatar_url, company_name, verified)", { count: "exact" });

  // If requesting own requests, need auth context via header
  if (mine === "true" && userId) {
    query = query.eq("created_by", userId);
  } else if (saved === "true" && userId) {
    // Get saved request IDs first
    const { data: savedData } = await supabaseAdmin
      .from("saved_requests")
      .select("request_id")
      .eq("operator_id", userId);
    const savedIds = savedData?.map((s) => s.request_id) || [];
    if (savedIds.length === 0) {
      return NextResponse.json({ requests: [], total: 0 });
    }
    query = query.in("id", savedIds);
  } else {
    // Public view: only show public requests
    query = query.eq("is_public", true);
  }

  if (search) {
    query = query.or(`city.ilike.%${search}%,state.ilike.%${search}%,title.ilike.%${search}%,location_name.ilike.%${search}%`);
  }
  if (locationType) query = query.eq("location_type", locationType);
  if (state) query = query.eq("state", state);
  if (urgency) query = query.eq("urgency", urgency);
  if (commission === "true") query = query.eq("commission_offered", true);
  if (status && status !== "all") query = query.eq("status", status);
  if (machineTypes) {
    const types = machineTypes.split(",");
    query = query.overlaps("machine_types_wanted", types);
  }

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data || [], total: count || 0 });
}

/** POST /api/requests — create a new vending request */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const { data, error } = await supabaseAdmin
      .from("vending_requests")
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
