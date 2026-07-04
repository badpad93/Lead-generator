import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { backfillCommissions } from "@/lib/commissions";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * POST /api/admin/financial/commissions/backfill
 * Body: { limit?: 500, since_days?: 365 }
 *
 * Walks paid payments in the window that lack commission_ledger entries and
 * produces earn rows using current rules + current attribution. Safe to
 * re-run — earn is idempotent per (order, payment, user, role).
 *
 * GET returns the count of paid payments that don't have any commission rows
 * yet, so the UI can show "N needing backfill" before running.
 */

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const sinceDays = Math.max(1, Math.min(3650, Number(url.searchParams.get("since_days") || 365)));
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { data: paidWithOrders } = await supabaseAdmin
    .from("payments")
    .select("id, order_id")
    .eq("status", "paid")
    .not("order_id", "is", null)
    .gte("paid_at", cutoff)
    .limit(5000);

  if (!paidWithOrders || paidWithOrders.length === 0) {
    return NextResponse.json({ needs_backfill: 0 });
  }

  const paymentIds = paidWithOrders.map((p) => p.id);
  const { data: existing } = await supabaseAdmin
    .from("commission_ledger")
    .select("payment_id")
    .in("payment_id", paymentIds);
  const covered = new Set((existing || []).map((r) => r.payment_id));
  const needsBackfill = paidWithOrders.filter((p) => !covered.has(p.id)).length;

  return NextResponse.json({ needs_backfill: needsBackfill });
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(2000, Number(body.limit || 500)));
  const sinceDays = Math.max(1, Math.min(3650, Number(body.since_days || 365)));

  const summary = await backfillCommissions({ limit, sinceDays, actorId: adminId });

  await writeAuditLog({
    actorId: adminId,
    action: "commissions_backfill_ran",
    entityType: "system",
    metadata: { limit, since_days: sinceDays, summary: summary as unknown as Record<string, unknown> },
  });

  return NextResponse.json(summary);
}
