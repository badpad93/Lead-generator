import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { createPurchaseOrder } from "@/lib/inventory/purchaseOrders";

/**
 * GET  /api/admin/inventory/purchase-orders — list POs
 * POST /api/admin/inventory/purchase-orders — create draft PO with lines
 */

const lineSchema = z.object({
  sku_id: z.string().uuid(),
  ordered_qty: z.number().positive(),
  unit_cost_cents: z.number().int().min(0).nullable().optional(),
  line_total_cents: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const createSchema = z.object({
  supplier_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  expected_delivery_date: z.string().nullable().optional(),
  supplier_reference: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  replenishment_run_id: z.string().uuid().nullable().optional(),
  lines: z.array(lineSchema).min(1).max(500),
  subtotal_cents: z.number().int().min(0).nullable().optional(),
  shipping_cents: z.number().int().min(0).nullable().optional(),
  tax_cents: z.number().int().min(0).nullable().optional(),
  total_cents: z.number().int().min(0).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const supplierId = url.searchParams.get("supplier_id");
  const warehouseId = url.searchParams.get("warehouse_id");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  let query = supabaseAdmin
    .from("purchase_orders")
    .select("*, suppliers:supplier_id(name), warehouses:warehouse_id(name, code)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);
  if (supplierId) query = query.eq("supplier_id", supplierId);
  if (warehouseId) query = query.eq("warehouse_id", warehouseId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchase_orders: data ?? [] });
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const result = await createPurchaseOrder({ ...parsed.data, created_by: adminId });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
