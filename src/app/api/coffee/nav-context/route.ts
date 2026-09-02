import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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
      .select("role, storefront_tenant_id")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  const profile = profileRow.data as {
    role: string | null;
    storefront_tenant_id: string | null;
  } | null;

  const enrolledId = profile?.storefront_tenant_id ?? null;
  const enrolled = enrolledId ? await resolveTenantById(enrolledId) : null;

  // can_own = eligible-to-become-a-tenant-owner. Operators are the
  // intended audience, but admins also qualify — the initial test
  // account (jamespadden93x@gmail.com) is role='admin' and needs to
  // be able to create + drive a tenant end-to-end during rollout,
  // otherwise the admin sees no "Set up my storefront" CTA at all
  // and the get-started flow is undiscoverable to the very account
  // running the pilot.
  // The DB has no CHECK on owner_profile_id.role, so this is purely
  // a UI-eligibility gate; the actual write goes through the same
  // createTenant helper with the same audit trail.
  const canOwn = profile?.role === "operator" || profile?.role === "admin";

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
