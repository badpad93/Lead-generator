import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { transferCustomer, EnrollmentError } from "@/lib/storefront/enrollment";

/**
 * Admin-only: transfer a customer profile from tenant A to tenant B.
 * This is the ONLY sanctioned path for changing the permanent
 * customer->tenant link. Reason is mandatory so the audit log has a
 * meaningful narrative.
 */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    customer_profile_id?: string;
    to_tenant_id?: string;
    reason?: string;
  };
  if (!body.customer_profile_id || !body.to_tenant_id || !body.reason) {
    return NextResponse.json(
      { error: "customer_profile_id, to_tenant_id, reason required" },
      { status: 400 },
    );
  }
  try {
    await transferCustomer({
      customerProfileId: body.customer_profile_id,
      toTenantId: body.to_tenant_id,
      adminActorId: adminId,
      reason: body.reason,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof EnrollmentError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("[admin/customers/transfer] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
