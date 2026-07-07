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

  // Phase 1 candidates: paid payments with order_id set + no ledger
  let phase1 = 0;
  const { data: paidWithOrders } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("status", "paid")
    .not("order_id", "is", null)
    .gte("paid_at", cutoff)
    .limit(5000);
  if (paidWithOrders && paidWithOrders.length > 0) {
    const paymentIds = paidWithOrders.map((p) => p.id);
    const { data: existing } = await supabaseAdmin
      .from("commission_ledger")
      .select("payment_id")
      .in("payment_id", paymentIds);
    const covered = new Set((existing || []).map((r) => r.payment_id));
    phase1 = paidWithOrders.filter((p) => !covered.has(p.id)).length;
  }

  // Phase 0 candidates: orphan payments (order_id=null but linked to an
  // invoice we could probably match to a sales_order via QB invoice id).
  let phase0 = 0;
  const { data: orphans } = await supabaseAdmin
    .from("payments")
    .select("id, invoice_id")
    .is("order_id", null)
    .eq("status", "paid")
    .gte("paid_at", cutoff)
    .limit(5000);
  phase0 = (orphans || []).filter((p) => !!p.invoice_id).length;

  // Phase 2 candidates: sales_orders marked paid with no ledger.
  let phase2 = 0;
  const { data: paidOrders } = await supabaseAdmin
    .from("sales_orders")
    .select("id")
    .in("payment_status", ["paid", "deposit_paid"])
    .gte("created_at", cutoff)
    .limit(5000);
  if (paidOrders && paidOrders.length > 0) {
    const orderIds = paidOrders.map((o) => o.id);
    const { data: existing } = await supabaseAdmin
      .from("commission_ledger")
      .select("order_id")
      .in("order_id", orderIds);
    const covered = new Set((existing || []).map((r) => r.order_id));
    phase2 = paidOrders.filter((o) => !covered.has(o.id)).length;
  }

  return NextResponse.json({
    needs_backfill: phase0 + phase1 + phase2,
    breakdown: {
      orphan_payments: phase0,
      paid_payments_missing_ledger: phase1,
      paid_orders_without_payment: phase2,
    },
  });
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
