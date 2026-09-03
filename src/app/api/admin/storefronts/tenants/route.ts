import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createTenant,
  suggestSlug,
  isValidSlug,
  StorefrontTenantError,
} from "@/lib/storefront/tenants";

/**
 * Admin: list every storefront tenant with status filter + owner + tier.
 * Used by the admin storefronts console home page.
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");
  let q = supabaseAdmin
    .from("storefront_tenants")
    .select("*, owner:profiles!storefront_tenants_owner_profile_id_fkey(id, full_name, email)")
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenants: data ?? [] });
}

/**
 * Admin: create a storefront tenant and assign an existing user
 * (typically an operator) as its owner. Admin-created tenants are
 * born approved — the admin creating it IS the approval.
 *
 * Body: { owner_profile_id, display_name, legal_name?, slug?,
 *         primary_contact_email? }
 * slug defaults to a slugified display_name; legal_name defaults
 * to display_name.
 */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    owner_profile_id?: string;
    display_name?: string;
    legal_name?: string;
    slug?: string;
    primary_contact_email?: string;
  };

  if (!body.owner_profile_id) {
    return NextResponse.json({ error: "owner_profile_id required" }, { status: 400 });
  }
  if (!body.display_name?.trim()) {
    return NextResponse.json({ error: "display_name required" }, { status: 400 });
  }

  // The owner must be a real profile — surface a clear 404 rather
  // than an FK violation.
  const { data: owner, error: ownerErr } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", body.owner_profile_id)
    .maybeSingle();
  if (ownerErr) return NextResponse.json({ error: ownerErr.message }, { status: 500 });
  if (!owner) return NextResponse.json({ error: "Owner profile not found" }, { status: 404 });

  try {
    const rawSlug = (body.slug ?? "").toLowerCase().trim();
    const slug = rawSlug && isValidSlug(rawSlug) ? rawSlug : suggestSlug(body.display_name);
    const tenant = await createTenant({
      ownerProfileId: body.owner_profile_id,
      slug,
      legalName: body.legal_name?.trim() || body.display_name.trim(),
      displayName: body.display_name.trim(),
      primaryContactEmail:
        body.primary_contact_email ?? (owner as { email?: string | null }).email ?? null,
      actorId: adminId,
      actorRole: "admin",
      initialStatus: "approved",
    });
    return NextResponse.json({ tenant }, { status: 201 });
  } catch (err) {
    if (err instanceof StorefrontTenantError) {
      const status =
        err.code === "SLUG_TAKEN" || err.code === "OWNER_HAS_TENANT" ? 409 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[admin/storefronts/tenants] create failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
