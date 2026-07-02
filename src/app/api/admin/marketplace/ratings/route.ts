import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const rateeType = searchParams.get("ratee_type") || "all";

  let query = supabaseAdmin
    .from("placement_ratings")
    .select("*, rater:rater_profile_id(full_name, email), submission:submission_id(business_name, city, state), contract:contract_id(title, tier)")
    .order("created_at", { ascending: false });
  if (rateeType !== "all") query = query.eq("ratee_type", rateeType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
