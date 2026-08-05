import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { runReplenishment } from "@/lib/inventory/replenishment";

/**
 * GET  /api/admin/inventory/replenishment/runs — list runs
 * POST /api/admin/inventory/replenishment/runs — kick off a new run
 *
 * Body:
 *   warehouse_id: uuid (required)
 *   as_of_date:   ISO date string (optional, defaults to today)
 *   sku_ids:      uuid[] (optional; omit to run all active SKUs)
 *   notes:        string (optional)
 */

const postSchema = z.object({
  warehouse_id: z.string().uuid(),
  as_of_date: z.string().optional(),
  sku_ids: z.array(z.string().uuid()).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const warehouseId = url.searchParams.get("warehouse_id");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  let query = supabaseAdmin
    .from("replenishment_runs")
    .select("*, warehouses:warehouse_id(name, code)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (warehouseId) query = query.eq("warehouse_id", warehouseId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }
  const p = parsed.data;

  try {
    const result = await runReplenishment({
      warehouseId: p.warehouse_id,
      asOfDate: p.as_of_date ?? undefined,
      skuIds: p.sku_ids ?? undefined,
      notes: p.notes ?? null,
      actorId: adminId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "run failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
