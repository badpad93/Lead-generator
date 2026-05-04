import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sanitizeSearch } from "@/lib/sanitizeSearch";

const PAGE_SIZE = 12;

function isPaidFeatured(profile: Record<string, unknown> | null): boolean {
  return profile?.featured === true && !!profile?.stripe_subscription_id;
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
  const { stripe_subscription_id: _sid, stripe_customer_id: _cid, ...clean } = profile;
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

    const from = page * PAGE_SIZE;
    const { data, error, count } = await query
      .order("featured", { ascending: false })
      .order("rating", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const operators = (data || []).map((op: Record<string, unknown>) =>
      stripOperatorProfile(op, isPaidFeatured(op))
    );

    return NextResponse.json({ operators, total: count || 0 });
  }

  // Listings mode
  let query = supabaseAdmin
    .from("operator_listings")
    .select("*, profiles!operator_id(id, full_name, company_name, verified, rating, review_count, address, city, state, zip, featured, stripe_subscription_id)", { count: "exact" });

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

  const listings = (data || []).map((listing: Record<string, unknown>) => {
    const profile = listing.profiles as Record<string, unknown> | null;
    const isFeatured = isPaidFeatured(profile);
    return {
      ...listing,
      profiles: stripOperatorProfile(profile, isFeatured),
    };
  });

  return NextResponse.json({ listings, total: count || 0 });
}
