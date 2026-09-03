import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { deleteStorefrontCustomer, EnrollmentError } from "@/lib/storefront/enrollment";

/**
 * Admin: customers of any storefront tenant.
 *   GET    -> list enrolled profiles for the tenant
 *   DELETE -> ?profile_id=… — delete the customer entirely (same
 *             shared logic as the owner endpoint: role='customer'
 *             accounts are removed outright with login killed and
 *             soft-delete fallback; other roles are unlinked only).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role, storefront_enrolled_at")
    .eq("storefront_tenant_id", id)
    .order("storefront_enrolled_at", { ascending: false });

  return NextResponse.json({ customers: data ?? [] });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const profileId = req.nextUrl.searchParams.get("profile_id");
  if (!profileId) return NextResponse.json({ error: "profile_id required" }, { status: 400 });

  try {
    const result = await deleteStorefrontCustomer({
      customerProfileId: profileId,
      tenantId: id,
      actorId: adminId,
      actorRole: "admin",
    });
    return NextResponse.json({ ok: true, mode: result.mode });
  } catch (err) {
    if (err instanceof EnrollmentError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 404 });
    }
    console.error("[admin/storefronts/customers DELETE] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
