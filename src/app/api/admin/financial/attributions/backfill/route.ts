import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { backfillAttributions } from "@/lib/salesAttribution";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * POST /api/admin/financial/attributions/backfill
 *
 * Seeds existing sales_orders rows with implicit 100% Lead Owner attribution
 * from assigned_rep_id / created_by. Marked is_legacy_backfill=true so future
 * admin views can distinguish "we backfilled" from "someone set this".
 * Idempotent — orders that already have any attribution row are skipped.
 *
 * Body: { limit?: 500, since_days?: 3650 }
 */

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(1000, Math.max(1, Number(body.limit || 500)));
  const sinceDays = Math.max(1, Math.min(3650, Number(body.since_days || 3650)));

  const summary = await backfillAttributions({ limit, sinceDays });

  await writeAuditLog({
    actorId: adminId,
    action: "attribution_backfill_ran",
    entityType: "system",
    metadata: { limit, since_days: sinceDays, summary: summary as unknown as Record<string, unknown> },
  });

  return NextResponse.json(summary);
}
