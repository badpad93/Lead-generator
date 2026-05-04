import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createListingSchema } from "@/lib/schemas";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { sanitizeSearch } from "@/lib/sanitizeSearch";

const PAGE_SIZE = 12;

/** Determine the role of the requesting user (if authenticated) */
async function getRequesterRole(req: NextRequest): Promise<string | null> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role ?? null;
}

/**
 * Strip operator profile data for location accounts.
 * Location accounts can only see operator zip codes — not business name or contact info.
 */
function stripOperatorProfileForLocations(profile: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!profile) return null;
  return {
    id: profile.id,
    address: profile.address ?? null,
    city: profile.city ?? null,
    zip: profile.zip ?? null,
    state: profile.state ?? null,
    verified: profile.verified ?? false,
    rating: profile.rating ?? 0,
    review_count: profile.review_count ?? 0,
    // Hide: full_name, company_name, email, phone, website, bio, city
    full_name: "Operator",
    company_name: null,
  };
}

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

  // Determine if requester is a location account
  const requesterRole = await getRequesterRole(req);
  const isLocationAccount = requesterRole === "location_manager";

  if (mode === "profiles") {
    let query = supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact" })
      .eq("role", "operator");

    if (search) {
      const s = sanitizeSearch(search);
      if (s) {
        if (requesterRole === "operator") {
          query = query.or(`full_name.ilike.%${s}%,company_name.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%`);
        } else {
          query = query.or(`city.ilike.%${s}%,state.ilike.%${s}%,zip.ilike.%${s}%`);
        }
      }
    }
    if (state) query = query.eq("state", state);

    const from = page * PAGE_SIZE;
    const { data, error, count } = await query
      .order("rating", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Strip company name and contact info for all non-operator viewers
    let operators = data || [];
    const isOperator = requesterRole === "operator";
    if (!isOperator) {
      operators = operators.map((op: Record<string, unknown>) => ({
        ...op,
        full_name: "Operator",
        company_name: null,
        email: null,
        phone: null,
        website: null,
        bio: null,
        // Keep: id, address, city, zip, state, verified, rating, review_count, role, created_at
      }));
    }

    return NextResponse.json({ operators, total: count || 0 });
  }

  // Listings mode
  let query = supabaseAdmin
    .from("operator_listings")
    .select("*, profiles!operator_id(id, full_name, company_name, verified, rating, review_count, address, city, state, zip)", { count: "exact" });

  if (mine === "true" && userId) {
    query = query.eq("operator_id", userId);
  }

  if (search) {
    const s = sanitizeSearch(search);
    if (s) query = query.or(`title.ilike.%${s}%`);
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

  // Strip operator profile data for non-operator viewers
  let listings = data || [];
  const isOp = requesterRole === "operator";
  if (!isOp) {
    listings = listings.map((listing: Record<string, unknown>) => ({
      ...listing,
      profiles: stripOperatorProfileForLocations(listing.profiles as Record<string, unknown> | null),
    }));
  }

  return NextResponse.json({ listings, total: count || 0 });
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
        featured: false, // All submissions require admin approval (set featured=true to approve)
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
