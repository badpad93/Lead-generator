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
      .select("storefront_tenant_id")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  const profile = profileRow.data as { storefront_tenant_id: string | null } | null;

  const enrolledId = profile?.storefront_tenant_id ?? null;
  const enrolled = enrolledId ? await resolveTenantById(enrolledId) : null;

  return NextResponse.json({
    owner_tenant: owned
      ? { slug: owned.slug, display_name: owned.display_name, status: owned.status }
      : null,
    enrolled_tenant:
      enrolled && enrolled.status === "approved"
        ? { slug: enrolled.slug, display_name: enrolled.display_name }
        : null,
  });
}
