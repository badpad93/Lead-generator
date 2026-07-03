import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { runBackfill } from "@/lib/paymentBackfill";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * GET /api/admin/financial/backfill?days=90&limit=200 — preview mode.
 *   Returns the plan (rows that would be created/skipped) with no writes.
 * POST — apply mode. Writes ledger rows and stamps financial_spine_* on
 *   the source rows. Records an audit_logs entry so we can prove what/when.
 *
 * Idempotent — re-running skips rows that are already backfilled.
 */

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(3650, Number(searchParams.get("days") || 90)));
  const limit = Math.max(10, Math.min(500, Number(searchParams.get("limit") || 200)));

  const plan = await runBackfill({ cutoffDays: days, apply: false, limit });
  return NextResponse.json(plan);
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const days = Math.max(1, Math.min(3650, Number(body.days || 90)));
  const limit = Math.max(10, Math.min(500, Number(body.limit || 200)));

  const plan = await runBackfill({ cutoffDays: days, apply: true, limit });

  await writeAuditLog({
    actorId: adminId,
    action: "financial_backfill_applied",
    entityType: "system",
    metadata: {
      cutoff_days: days,
      limit,
      summary: plan.summary,
    },
  });

  return NextResponse.json({ ok: true, summary: plan.summary, rows: plan.rows });
}
