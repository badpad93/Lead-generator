import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminByEmail } from "@/lib/adminAuth";
import { resolveTenantByOwner, resolveTenantById } from "@/lib/storefront/tenants";

/**
 * Small server helper that tells the client which storefront nav
 * entries to surface for the current user. One roundtrip per page
 * load, no client-side chaining of "get profile → get tenant".
 *
 * Response shape (all fields nullable):
 *   {
 *     owner_tenant:    { slug, display_name, status } | null,
 *     enrolled_tenant: { slug, display_name }         | null
 *   }
 *
 * owner_tenant is set for an operator that owns a
 * storefront_tenants row (any status). The client uses this to
 * link to /coffee/storefront regardless of approval state so the
 * owner can see their pending tenant and finish setup.
 *
 * enrolled_tenant is set when the profile has a permanent
 * storefront_tenant_id AND that tenant is approved. Unapproved
 * (suspended/closed) tenants intentionally return null — a
 * customer whose tenant is off shouldn't see a broken link.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ owner_tenant: null, enrolled_tenant: null });
  }

  const [owned, profileRow] = await Promise.all([
    resolveTenantByOwner(userId),
    supabaseAdmin
      .from("profiles")
      .select("role, email, storefront_tenant_id")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  const profile = profileRow.data as {
    role: string | null;
    email: string | null;
    storefront_tenant_id: string | null;
  } | null;

  const enrolledId = profile?.storefront_tenant_id ?? null;
  const enrolled = enrolledId ? await resolveTenantById(enrolledId) : null;

  // can_own = eligible-to-become-a-tenant-owner. Two paths:
  //   1. profile.role is 'operator' or 'admin'
  //   2. profile.email is in ADMIN_EMAILS (via isAdminByEmail)
  //
  // The email allowlist matters because ADMIN_EMAILS grants admin
  // access independent of the DB role — a user in that list often
  // still has role='requestor' or similar in the profiles table.
  // Without the allowlist check, the pilot admin (whose email is
  // allowlisted but whose DB role isn't 'admin') sees no
  // "Set up my storefront" CTA anywhere.
  //
  // The DB has no CHECK on owner_profile_id.role, so this is purely
  // a UI-eligibility gate; the actual write goes through the same
  // createTenant helper with the same audit trail.
  const roleCanOwn = profile?.role === "operator" || profile?.role === "admin";
  const emailIsAdmin = profile?.email ? await isAdminByEmail(profile.email) : false;
  const canOwn = roleCanOwn || emailIsAdmin;

  return NextResponse.json({
    owner_tenant: owned
      ? { slug: owned.slug, display_name: owned.display_name, status: owned.status }
      : null,
    can_own_storefront: canOwn,
    enrolled_tenant:
      enrolled && enrolled.status === "approved"
        ? { slug: enrolled.slug, display_name: enrolled.display_name }
        : null,
  });
}
