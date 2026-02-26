import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createListingSchema } from "@/lib/schemas";
import { getUserIdFromRequest } from "@/lib/apiAuth";

const PAGE_SIZE = 12;

/** GET /api/operators — list operator listings or operator profiles */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const search = params.get("search");
  const machineTypes = params.get("machine_types");
  const state = params.get("state");
  const commission = params.get("commission");
  const page = Math.max(0, parseInt(params.get("page") || "0"));
  const mine = params.get("mine");
  const userId = params.get("user_id");
  const mode = params.get("mode") || "listings"; // "listings" or "profiles"

  if (mode === "profiles") {
    let query = supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact" })
      .eq("role", "operator");

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,company_name.ilike.%${search}%,city.ilike.%${search}%,state.ilike.%${search}%`);
    }
    if (state) query = query.eq("state", state);

    const from = page * PAGE_SIZE;
    const { data, error, count } = await query
      .order("rating", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ operators: data || [], total: count || 0 });
  }

  // Listings mode
  let query = supabaseAdmin
    .from("operator_listings")
    .select("*, profiles!operator_id(id, full_name, avatar_url, company_name, verified, rating, review_count, city, state)", { count: "exact" });

  if (mine === "true" && userId) {
    query = query.eq("operator_id", userId);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%`);
  }
  if (machineTypes) {
    query = query.overlaps("machine_types", machineTypes.split(","));
  }
  if (state) {
    query = query.contains("states_served", [state]);
  }
  if (commission === "true") {
    query = query.eq("accepts_commission", true);
  }

  const from = page * PAGE_SIZE;
  const { data, error, count } = await query
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: data || [], total: count || 0 });
}

/** POST /api/operators — create a new operator listing */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const { data, error } = await supabaseAdmin
      .from("operator_listings")
      .insert({
        operator_id: userId,
        ...parsed.data,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
