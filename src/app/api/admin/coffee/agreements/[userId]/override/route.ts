import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { grantLegacyApproval } from "@/lib/placementAgreements";

/**
 * POST /api/admin/coffee/agreements/[userId]/override
 * Body: { reason: string }
 *
 * One-off admin override so an operator can order despite not having signed
 * the CURRENT Equipment Loan & Beverage Supply (coffee_supply) agreement.
 *
 * Delegates to grantLegacyApproval, which sets the operator's coffee_supply
 * agreement (against the active template) to `legacy_approved` — the status
 * the ordering gate (requireExecutedCoffeeSupplyAgreement) accepts. A reason
 * is required and an `admin_override_granted` audit event is written with the
 * acting admin + reason. This does NOT sign anything on the operator's
 * behalf, and it is superseded automatically if the operator later signs the
 * updated agreement (→ fully_executed).
 *
 * Admin-only (getAdminUserId). No new access is granted to any other role.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "A reason for the override is required." }, { status: 400 });
  }

  try {
    const row = await grantLegacyApproval({
      userId,
      adminUserId: adminId,
      reason,
      agreementType: "coffee_supply",
    });
    return NextResponse.json({ ok: true, agreement: { id: row.id, status: row.status } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // No active coffee_supply template → misconfiguration, surface clearly.
    const status = /no active/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
