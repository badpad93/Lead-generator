import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/** GET /api/operators/[id] — get an operator's profile with listings */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Determine requester role for data access control
  const requesterId = await getUserIdFromRequest(req);
  let requesterRole: string | null = null;
  if (requesterId) {
    const { data: requesterProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", requesterId)
      .single();
    requesterRole = requesterProfile?.role ?? null;
  }
  const isOperator = requesterRole === "operator";

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .eq("role", "operator")
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Operator not found" }, { status: 404 });
  }

  // Strip company name and contact info for non-operator viewers; keep city/state
  let safeProfile = profile;
  if (!isOperator) {
    safeProfile = {
      ...profile,
      full_name: "Operator",
      company_name: null,
      email: null,
      phone: null,
      website: null,
      bio: null,
      // Keep: id, city, state, zip, address, verified, rating, review_count, role, created_at
    };
  }

  // Get their listings
  const { data: listings } = await supabaseAdmin
    .from("operator_listings")
    .select("*")
    .eq("operator_id", id)
    .order("created_at", { ascending: false });

  // Get reviews
  const { data: reviews } = await supabaseAdmin
    .from("reviews")
    .select("*, reviewer:profiles!reviewer_id(id, full_name)")
    .eq("reviewee_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Get match stats
  const { count: totalMatches } = await supabaseAdmin
    .from("matches")
    .select("*", { count: "exact", head: true })
    .eq("operator_id", id);

  const { count: installedCount } = await supabaseAdmin
    .from("matches")
    .select("*", { count: "exact", head: true })
    .eq("operator_id", id)
    .eq("status", "installed");

  return NextResponse.json({
    profile: safeProfile,
    listings: listings || [],
    reviews: reviews || [],
    stats: {
      totalMatches: totalMatches || 0,
      installed: installedCount || 0,
    },
  });
}
