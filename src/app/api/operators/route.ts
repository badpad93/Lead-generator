import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sanitizeSearch } from "@/lib/sanitizeSearch";

const PAGE_SIZE = 12;

function isFeaturedOperator(profile: Record<string, unknown> | null): boolean {
  return profile?.featured === true;
}

/**
 * Strip operator profile data.
 * Non-featured operators: only show city, state, zip, verified status.
 * Featured operators ($29.99/mo subscription): show full profile info.
 */
function stripOperatorProfile(
  profile: Record<string, unknown> | null,
  isFeatured: boolean
): Record<string, unknown> | null {
  if (!profile) return null;
  const { stripe_subscription_id: _sid, stripe_customer_id: _cid, ...clean } = profile as Record<string, unknown>;
  if (isFeatured) return { ...clean, featured: true };
  return {
    id: profile.id,
    city: profile.city ?? null,
    zip: profile.zip ?? null,
    state: profile.state ?? null,
    verified: profile.verified ?? false,
    rating: profile.rating ?? 0,
    review_count: profile.review_count ?? 0,
    role: profile.role ?? "operator",
    created_at: profile.created_at ?? null,
    full_name: "Operator",
    company_name: null,
    email: null,
    phone: null,
    website: null,
    bio: null,
    address: null,
  };
}

/** GET /api/operators — list operator listings or operator profiles */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const search = params.get("search");
  const machineTypes = params.get("machine_types");
  const state = params.get("state");
  const commission = params.get("commission");
  const featured = params.get("featured");
  const userState = params.get("user_state");
  const limit = params.get("limit") ? parseInt(params.get("limit")!) : null;
  const page = Math.max(0, parseInt(params.get("page") || "0"));
  const mine = params.get("mine");
  const userId = params.get("user_id");
  const mode = params.get("mode") || "listings";

  if (mode === "profiles") {
    let query = supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact" })
      .eq("role", "operator");

    if (search) {
      const s = sanitizeSearch(search);
      if (s) {
        query = query.or(`city.ilike.%${s}%,state.ilike.%${s}%,zip.ilike.%${s}%`);
      }
    }
    if (state) query = query.eq("state", state);
    if (featured === "true") query = query.eq("featured", true);

    const effectiveLimit = limit ?? PAGE_SIZE;
    const from = page * effectiveLimit;
    const { data, error, count } = await query
      .order("featured", { ascending: false })
      .order("rating", { ascending: false })
      .range(from, from + effectiveLimit - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const operators = (data || []).map((op: Record<string, unknown>) =>
      stripOperatorProfile(op, isFeaturedOperator(op))
    );

    return NextResponse.json({ operators, total: count || 0 });
  }

  // Listings mode
  const profileSelect = "id, full_name, company_name, verified, rating, review_count, address, city, state, zip, featured";
  const effectiveLimit = limit ?? PAGE_SIZE;

  // State-prioritised featured query: fetch from user's state first, backfill with others
  if (featured === "true" && userState) {
    const buildQuery = (stateFilter: "match" | "other") => {
      let q = supabaseAdmin
        .from("operator_listings")
        .select(`*, profiles!operator_id(${profileSelect})`)
        .eq("featured", true);

      if (stateFilter === "match") {
        q = q.contains("states_served", [userState]);
      } else {
        q = q.not("states_served", "cs", `{${userState}}`);
      }

      if (mine === "true" && userId) q = q.eq("operator_id", userId);
      if (search) { const s = sanitizeSearch(search); if (s) q = q.or(`title.ilike.%${s}%`); }
      if (machineTypes) q = q.overlaps("machine_types", machineTypes.split(","));
      if (state) q = q.contains("states_served", [state]);
      if (commission === "true") q = q.eq("accepts_commission", true);

      return q.order("rating", { ascending: false, referencedTable: "profiles" })
              .order("created_at", { ascending: false });
    };

    const { data: local, error: localErr } = await buildQuery("match").limit(effectiveLimit);
    if (localErr) return NextResponse.json({ error: localErr.message }, { status: 500 });

    let combined = local || [];
    if (combined.length < effectiveLimit) {
      const remaining = effectiveLimit - combined.length;
      const { data: others } = await buildQuery("other").limit(remaining);
      if (others) combined = [...combined, ...others];
    }

    const listings = combined.map((listing: Record<string, unknown>) => {
      const profile = listing.profiles as Record<string, unknown> | null;
      return { ...listing, profiles: stripOperatorProfile(profile, isFeaturedOperator(profile)) };
    });

    return NextResponse.json({ listings, total: listings.length });
  }

  let query = supabaseAdmin
    .from("operator_listings")
    .select(`*, profiles!operator_id(${profileSelect})`, { count: "exact" });

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
  if (featured === "true") {
    query = query.eq("featured", true);
  }

  const from = page * effectiveLimit;
  const { data, error, count } = await query
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + effectiveLimit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const listings = (data || []).map((listing: Record<string, unknown>) => {
    const profile = listing.profiles as Record<string, unknown> | null;
    const isFeatured = isFeaturedOperator(profile);
    return {
      ...listing,
      profiles: stripOperatorProfile(profile, isFeatured),
    };
  });

  return NextResponse.json({ listings, total: count || 0 });
}
