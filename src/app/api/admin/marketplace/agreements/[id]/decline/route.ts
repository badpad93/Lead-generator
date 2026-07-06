import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { decline, requestCorrection } from "@/lib/placementAgreements";

/**
 * POST /api/admin/marketplace/agreements/[id]/decline
 * Body: { action: 'decline' | 'request_correction', reason: string }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const reason = String(body.reason || "").trim();
  if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 400 });

  try {
    const updated = action === "request_correction"
      ? await requestCorrection({ agreementId: id, adminUserId: adminId, reason })
      : await decline({ agreementId: id, adminUserId: adminId, reason });
    return NextResponse.json({ ok: true, agreement: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
