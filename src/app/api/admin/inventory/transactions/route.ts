import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { postTransaction } from "@/lib/inventory/ledger";

/**
 * GET  /api/admin/inventory/transactions — recent ledger history
 * POST /api/admin/inventory/transactions — post a new transaction
 *
 * Admins post transactions here for: initial_balance seeding, manual
 * adjustments, spoilage/waste/damage, transfers between warehouses,
 * and returns. Consumption / receipts are typically posted by
 * upstream services (coffee-order fulfill hook in Phase 2, PO
 * receiving in Phase 3) that call postTransaction() directly rather
 * than via HTTP.
 */

const transactionTypeEnum = z.enum([
  "initial_balance",
  "receipt",
  "consumption",
  "consumption_reversal",
  "spoilage",
  "waste",
  "damage",
  "return",
  "manual_adjustment",
  "count_adjustment",
  "transfer_out",
  "transfer_in",
]);

const postSchema = z.object({
  sku_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  transaction_type: transactionTypeEnum,
  qty_delta: z.number(),
  reason: z.string().max(1000).nullable().optional(),
  reference_type: z.string().max(60).nullable().optional(),
  reference_id: z.string().uuid().nullable().optional(),
  counterparty_warehouse_id: z.string().uuid().nullable().optional(),
  reverses_transaction_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const skuId = url.searchParams.get("sku_id");
  const warehouseId = url.searchParams.get("warehouse_id");
  const type = url.searchParams.get("type");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  let query = supabaseAdmin
    .from("inventory_transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (skuId) query = query.eq("sku_id", skuId);
  if (warehouseId) query = query.eq("warehouse_id", warehouseId);
  if (type) query = query.eq("transaction_type", type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactions: data ?? [] });
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
    const row = await postTransaction({
      skuId: p.sku_id,
      warehouseId: p.warehouse_id,
      transactionType: p.transaction_type,
      qtyDelta: p.qty_delta,
      reason: p.reason ?? null,
      referenceType: p.reference_type ?? null,
      referenceId: p.reference_id ?? null,
      counterpartyWarehouseId: p.counterparty_warehouse_id ?? null,
      reversesTransactionId: p.reverses_transaction_id ?? null,
      notes: p.notes ?? null,
      createdBy: adminId,
    });
    return NextResponse.json({ transaction: row }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
