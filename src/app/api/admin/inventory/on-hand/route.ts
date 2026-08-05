import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { computeOnHandBatch } from "@/lib/inventory/ledger";

/**
 * GET /api/admin/inventory/on-hand?warehouse_id=<uuid>[&sku_id=<uuid>]
 *
 * Returns computed on-hand for every active SKU at the requested
 * warehouse (or just one SKU when sku_id is provided). Always
 * computed from the ledger — never a cached value.
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const warehouseId = url.searchParams.get("warehouse_id");
  const skuId = url.searchParams.get("sku_id");

  if (!warehouseId) {
    return NextResponse.json({ error: "warehouse_id is required" }, { status: 400 });
  }

  let skuQuery = supabaseAdmin
    .from("inventory_skus")
    .select("id, sku_code, name, category, unit_of_measure, pack_size, active")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  if (skuId) skuQuery = skuQuery.eq("id", skuId);

  const { data: skus, error } = await skuQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const skuList = (skus ?? []) as Array<{
    id: string;
    sku_code: string;
    name: string;
    category: string;
    unit_of_measure: string;
    pack_size: number;
    active: boolean;
  }>;

  const onHandMap = await computeOnHandBatch(
    skuList.map((s) => ({ skuId: s.id, warehouseId })),
  );

  const rows = skuList.map((s) => ({
    sku_id: s.id,
    sku_code: s.sku_code,
    name: s.name,
    category: s.category,
    unit_of_measure: s.unit_of_measure,
    pack_size: s.pack_size,
    on_hand: onHandMap.get(`${s.id}::${warehouseId}`) ?? 0,
  }));

  return NextResponse.json({ warehouse_id: warehouseId, rows });
}
