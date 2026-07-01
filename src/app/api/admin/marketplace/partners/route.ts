import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";
  const search = (searchParams.get("search") || "").trim().toLowerCase();

  const { data: partners, error } = await supabaseAdmin
    .from("placement_partners")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with profile + counts. Small dataset in this phase — inline hydration is fine.
  const profileIds = Array.from(new Set((partners || []).map((p) => p.id)));
  let profilesById: Record<string, { full_name: string; email: string; phone: string | null }> = {};
  if (profileIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, phone")
      .in("id", profileIds);
    profilesById = Object.fromEntries(
      (profiles || []).map((p) => [p.id, { full_name: p.full_name, email: p.email, phone: p.phone }]),
    );
  }

  const filtered = (partners || [])
    .map((p) => ({
      ...p,
      profile: profilesById[p.id] || null,
    }))
    .filter((p) => {
      // Status filter
      if (status === "pending_verification") {
        if (!p.onboarding_complete) return false;
        if (p.identity_verified_at) return false;
      } else if (status === "verified") {
        if (!p.identity_verified_at) return false;
      } else if (status === "onboarding") {
        if (p.onboarding_complete) return false;
      } else if (status === "inactive") {
        if (p.active) return false;
      }

      // Search
      if (search) {
        const q = search;
        const bn = (p.business_name || "").toLowerCase();
        const nm = (p.profile?.full_name || "").toLowerCase();
        const em = (p.profile?.email || "").toLowerCase();
        if (!bn.includes(q) && !nm.includes(q) && !em.includes(q)) return false;
      }
      return true;
    });

  return NextResponse.json(filtered);
}
