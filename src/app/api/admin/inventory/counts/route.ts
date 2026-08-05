import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserId } from "@/lib/adminAuth";
import { postPhysicalCount } from "@/lib/inventory/ledger";

/**
 * POST /api/admin/inventory/counts — record a physical count
 *
 * Inserts a physical_counts audit row and, if the variance is non-zero,
 * a count_adjustment inventory_transactions row. Never overwrites the
 * ledger — the count-adjustment IS the correction.
 */

const countSchema = z.object({
  sku_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  counted_qty: z.number().min(0),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = countSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const result = await postPhysicalCount({
      skuId: parsed.data.sku_id,
      warehouseId: parsed.data.warehouse_id,
      countedQty: parsed.data.counted_qty,
      notes: parsed.data.notes ?? null,
      countedBy: adminId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "count failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
