import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { mirrorPaidCoffeeOrdersBackfill } from "@/lib/coffeeCrmMirror";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * POST /api/admin/coffee/mirror-backfill
 *
 * Walks paid coffee_orders that don't have a linked sales_order_id and creates
 * a matching sales_orders + order_items shell for each. Idempotent — running
 * again is a no-op for already-mirrored orders.
 *
 * Body:
 *   { limit?: number, since_days?: number }
 * Defaults: limit=100, since_days=90.
 */

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(500, Math.max(1, Number(body.limit || 100)));
  const sinceDays = Math.max(1, Math.min(3650, Number(body.since_days || 90)));

  const summary = await mirrorPaidCoffeeOrdersBackfill({ limit, sinceDays });

  await writeAuditLog({
    actorId: adminId,
    action: "coffee_crm_backfill_ran",
    entityType: "system",
    metadata: { limit, since_days: sinceDays, summary: summary as unknown as Record<string, unknown> },
  });

  return NextResponse.json(summary);
}

/** GET — same as POST but read-only friendly (returns a preview count). */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { count } = await supabaseAdmin
    .from("coffee_orders")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "processing", "shipped", "delivered"])
    .is("sales_order_id", null);
  return NextResponse.json({ needs_backfill: count || 0 });
}
