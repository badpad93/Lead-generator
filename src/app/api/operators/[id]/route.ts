import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** GET /api/operators/[id] — get an operator's profile with listings */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .eq("role", "operator")
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Operator not found" }, { status: 404 });
  }

  const isFeatured = profile.featured === true;

  // Non-featured operators: strip all identifying info
  let safeProfile = profile;
  if (!isFeatured) {
    safeProfile = {
      ...profile,
      full_name: "Operator",
      company_name: null,
      email: null,
      phone: null,
      website: null,
      bio: null,
      address: null,
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
