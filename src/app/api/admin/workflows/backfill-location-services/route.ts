import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { spawnLocationServicesWorkflowFromPaidOrder } from "@/lib/workflows/paymentSync";

/**
 * POST /api/admin/workflows/backfill-location-services
 *
 * One-shot backfill for paid location-services requests that never
 * got a workflow spawned. Recovers rows affected by the pre-e356c82
 * bug where /request-location intake didn't attach a workflow when
 * the customer was a guest (no profile at payment time).
 *
 * Scans sales_orders where:
 *   - order_type = 'location_services'
 *   - payment_status = 'paid'
 *   - no workflow row currently linked (workflows.order_id != id)
 *
 * For each match, calls spawnLocationServicesWorkflowFromPaidOrder,
 * which now provisions a provisional profile if the customer never
 * signed up. Reports per-order outcomes so an admin can see which
 * spawned, which were already covered, and which failed and why.
 *
 * Idempotent — safe to run more than once. Only picks up orders
 * that STILL have no workflow linked.
 */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Step 1: pull every paid location_services order.
  const { data: orders, error: ordersErr } = await supabaseAdmin
    .from("sales_orders")
    .select("id, recipient_email, created_at")
    .eq("order_type", "location_services")
    .eq("payment_status", "paid")
    .order("created_at", { ascending: true });
  if (ordersErr) {
    return NextResponse.json({ error: ordersErr.message }, { status: 500 });
  }

  const paidOrders = orders ?? [];
  if (paidOrders.length === 0) {
    return NextResponse.json({
      ok: true,
      scanned: 0,
      spawned: 0,
      already_linked: 0,
      failed: 0,
      details: [],
    });
  }

  // Step 2: find which of those already have a workflow. One query
  // for the whole set to avoid N+1.
  const orderIds = paidOrders.map((o) => o.id);
  const { data: linkedRows } = await supabaseAdmin
    .from("workflows")
    .select("order_id")
    .in("order_id", orderIds);
  const linkedSet = new Set<string>((linkedRows ?? []).map((r) => r.order_id as string));

  const backlog = paidOrders.filter((o) => !linkedSet.has(o.id));

  // Step 3: spawn each unlinked one. spawnLocationServicesWorkflowFromPaidOrder
  // is idempotent (checks its own existing-workflow guard); returns
  // the workflow id on success, null when it couldn't (bad data /
  // provisional-provisioning failure). Serial rather than
  // Promise.all so we don't hammer supabase in a single burst.
  const details: Array<{
    order_id: string;
    recipient_email: string | null;
    outcome: "spawned" | "already_linked" | "failed";
    workflow_id?: string;
    reason?: string;
  }> = [];
  let spawned = 0;
  let failed = 0;

  for (const order of backlog) {
    try {
      const workflowId = await spawnLocationServicesWorkflowFromPaidOrder(order.id);
      if (workflowId) {
        spawned += 1;
        details.push({
          order_id: order.id,
          recipient_email: order.recipient_email ?? null,
          outcome: "spawned",
          workflow_id: workflowId,
        });
      } else {
        failed += 1;
        details.push({
          order_id: order.id,
          recipient_email: order.recipient_email ?? null,
          outcome: "failed",
          reason: "spawn helper returned null (see server logs for the specific reason — most likely missing lead data or provisional-profile provisioning failure)",
        });
      }
    } catch (err) {
      failed += 1;
      details.push({
        order_id: order.id,
        recipient_email: order.recipient_email ?? null,
        outcome: "failed",
        reason: err instanceof Error ? err.message.slice(0, 300) : "unknown error",
      });
    }
  }

  const alreadyLinked = paidOrders.length - backlog.length;
  for (const order of paidOrders) {
    if (linkedSet.has(order.id)) {
      details.push({
        order_id: order.id,
        recipient_email: order.recipient_email ?? null,
        outcome: "already_linked",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: paidOrders.length,
    spawned,
    already_linked: alreadyLinked,
    failed,
    details,
  });
}
