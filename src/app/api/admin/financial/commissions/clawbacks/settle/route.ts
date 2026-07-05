import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { settleClawbacks } from "@/lib/commissions";

/**
 * POST /api/admin/financial/commissions/clawbacks/settle
 * Body: { ids: string[], outcome: 'collected' | 'waived', note?: string }
 *
 * Resolves outstanding clawback_pending rows.
 *   collected → money recovered from the rep (payroll deduction, invoice)
 *   waived    → company absorbs the loss
 */

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((v: unknown) => typeof v === "string") : [];
  const outcome = body.outcome === "collected" || body.outcome === "waived" ? body.outcome : null;
  const note = body.note ? String(body.note) : null;

  if (!outcome) return NextResponse.json({ error: "outcome must be 'collected' or 'waived'" }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ error: "No clawback ids provided." }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: "Too many ids (max 500 per call)." }, { status: 400 });

  const result = await settleClawbacks({ ids, outcome, actorId: adminId, note });
  return NextResponse.json(result);
}
