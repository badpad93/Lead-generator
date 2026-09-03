import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Admin: search profiles for the storefront-owner picker.
 *
 * Returns candidate owners matching ?search= against name/email,
 * annotated with whether they already own a storefront (one tenant
 * per owner is a DB constraint, so the picker greys those out) and
 * whether they've signed the coffee agreement (informational badge —
 * admin-created tenants are approved either way).
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = (req.nextUrl.searchParams.get("search") ?? "").trim();

  // 200 rows so the picker can actually be browsed without typing —
  // the old 25 cap made "scroll through all users" impossible.
  // Search still narrows server-side for larger user bases.
  let q = supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role, coffee_agreement_signed")
    .order("full_name", { ascending: true })
    .limit(200);
  if (search) {
    // Escape PostgREST or() specials so a search like "a,b" or "(x)"
    // filters instead of erroring the whole query (which surfaced in
    // the UI as an empty, unselectable list).
    const safe = search.replace(/[,()]/g, " ").trim();
    if (safe) {
      q = q.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`);
    }
  }
  const { data: profiles, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (profiles ?? []).map((p) => p.id);
  let ownedBy = new Set<string>();
  if (ids.length > 0) {
    const { data: tenants } = await supabaseAdmin
      .from("storefront_tenants")
      .select("owner_profile_id")
      .in("owner_profile_id", ids);
    ownedBy = new Set((tenants ?? []).map((t) => t.owner_profile_id as string));
  }

  return NextResponse.json({
    owners: (profiles ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: p.role,
      coffee_agreement_signed: p.coffee_agreement_signed === true,
      owns_storefront: ownedBy.has(p.id),
    })),
  });
}
