import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET  /api/admin/inventory/skus — list SKUs (optionally filtered)
 * POST /api/admin/inventory/skus — create a SKU (admin only)
 *
 * The SKU registry sits between the marketplace catalog (coffee_products)
 * and the ledger. A SKU may reference a coffee_products row via
 * coffee_product_id when the marketplace also sells it; SKUs that
 * only exist internally (cleaning supplies, etc.) leave that null.
 */

const createSchema = z.object({
  sku_code: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(80).default("other"),
  unit_of_measure: z.string().max(40).default("each"),
  pack_size: z.number().int().min(1).default(1),
  coffee_product_id: z.string().uuid().nullable().optional(),
  preferred_supplier_id: z.string().uuid().nullable().optional(),
  lead_time_days_override: z.number().int().min(0).nullable().optional(),
  safety_stock_pct_override: z.number().min(0).max(1).nullable().optional(),
  lookback_weeks_override: z.number().int().min(6).max(12).nullable().optional(),
  forecast_method_override: z.enum(["simple", "weighted"]).nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const active = url.searchParams.get("active");
  const category = url.searchParams.get("category");
  const supplierId = url.searchParams.get("supplier_id");
  const search = url.searchParams.get("search");

  let query = supabaseAdmin
    .from("inventory_skus")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (active === "true") query = query.eq("active", true);
  if (active === "false") query = query.eq("active", false);
  if (category) query = query.eq("category", category);
  if (supplierId) query = query.eq("preferred_supplier_id", supplierId);
  if (search) query = query.or(`sku_code.ilike.%${search}%,name.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ skus: data ?? [] });
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("inventory_skus")
    .insert({ ...parsed.data, created_by: adminId })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sku: data }, { status: 201 });
}
