import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET   /api/admin/inventory/skus/[id] — single SKU
 * PATCH /api/admin/inventory/skus/[id] — update SKU
 * DELETE handled via PATCH { active: false } — never hard-deleted so
 *   ledger references remain intact.
 */

const patchSchema = z.object({
  sku_code: z.string().min(1).max(60).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(80).optional(),
  unit_of_measure: z.string().max(40).optional(),
  pack_size: z.number().int().min(1).optional(),
  coffee_product_id: z.string().uuid().nullable().optional(),
  preferred_supplier_id: z.string().uuid().nullable().optional(),
  lead_time_days_override: z.number().int().min(0).nullable().optional(),
  safety_stock_pct_override: z.number().min(0).max(1).nullable().optional(),
  lookback_weeks_override: z.number().int().min(6).max(12).nullable().optional(),
  forecast_method_override: z.enum(["simple", "weighted"]).nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("inventory_skus")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ sku: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("inventory_skus")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sku: data });
}
