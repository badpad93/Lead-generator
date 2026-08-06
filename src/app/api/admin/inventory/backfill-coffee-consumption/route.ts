import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { postConsumptionForCoffeeOrder } from "@/lib/inventory/coffeeOrderConsumption";

/**
 * POST /api/admin/inventory/backfill-coffee-consumption
 * Body: { since?: ISO date }
 *
 * Retroactively writes `consumption` inventory_transactions for
 * every coffee_orders row that is currently `shipped` or
 * `delivered` (i.e. physically left the warehouse) but has no
 * ledger row referencing it. Uses the order's `created_at` as the
 * transaction's created_at so the forecast engine's Monday-anchored
 * weekly bucketing lands on the real week the sale happened.
 *
 * Idempotent: postConsumptionForCoffeeOrder skips lines that already
 * have coverage, so re-running only touches new orders.
 *
 * Optional `since` narrows to orders created after that date — the
 * default backfills every fulfilled coffee order in the DB.
 *
 * Cancelled orders are skipped — no way to tell from the data alone
 * whether they were ever shipped, and writing a phantom consumption
 * would corrupt the ledger.
 */

const bodySchema = z.object({
  since: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const since = parsed.success ? parsed.data.since : undefined;

  let ordersQuery = supabaseAdmin
    .from("coffee_orders")
    .select("id, status, created_at")
    .in("status", ["shipped", "delivered"])
    .order("created_at", { ascending: true });
  if (since) ordersQuery = ordersQuery.gte("created_at", since);

  const { data: ordersData, error } = await ordersQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const orders = (ordersData ?? []) as Array<{
    id: string;
    status: string;
    created_at: string;
  }>;

  let processedOrders = 0;
  let writtenTx = 0;
  let noSkuLines = 0;
  const errors: Array<{ order_id: string; reason: string }> = [];

  for (const o of orders) {
    try {
      const result = await postConsumptionForCoffeeOrder(o.id, adminId, {
        createdAt: o.created_at,
        noteSuffix: "historical backfill",
      });
      processedOrders += 1;
      writtenTx += result.writtenTransactionIds.length;
      noSkuLines += result.skippedNoSku.length;
    } catch (err) {
      errors.push({
        order_id: o.id,
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    total_orders_scanned: orders.length,
    orders_processed: processedOrders,
    ledger_rows_written: writtenTx,
    order_lines_without_inventory_sku: noSkuLines,
    errors,
    note:
      noSkuLines > 0
        ? "Some order lines had no inventory_skus link. Create/link those SKUs then re-run this endpoint — it's idempotent."
        : undefined,
  });
}
