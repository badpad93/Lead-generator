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

  let q = supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role, coffee_agreement_signed")
    .order("full_name", { ascending: true })
    .limit(25);
  if (search) {
    q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
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
