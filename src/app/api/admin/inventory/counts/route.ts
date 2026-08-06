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

// Preprocess helpers — the modal binds inputs to string state, and
// the JSON boundary can turn NaN into null, blank fields into "",
// numeric strings into "42" etc. Coerce here so the schema focuses
// on shape not typing.
const numericQty = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}, z.number().min(0));

const nullableStr = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().max(max).nullable().optional(),
  );

const countSchema = z.object({
  sku_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  counted_qty: numericQty,
  notes: nullableStr(2000),
});

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = countSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") || "unknown_field";
    return NextResponse.json(
      { error: `Invalid input on ${path}: ${first?.message ?? "validation failed"}`, details: parsed.error.format() },
      { status: 400 },
    );
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
