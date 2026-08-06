import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * POST /api/admin/inventory/skus/bulk-assign-supplier
 * Body: {
 *   supplier_id: uuid,
 *   mode: "unassigned_only" | "overwrite_all",
 *   category?: string   // optional narrow: only SKUs in this category
 * }
 *
 * Reassigns the preferred_supplier_id on a batch of active SKUs.
 *
 * unassigned_only (default): only touches SKUs where
 *   preferred_supplier_id IS NULL — safe, non-destructive.
 * overwrite_all: replaces even the ones that already had a supplier
 *   set — use with care, admin confirms in the UI.
 *
 * Only active SKUs are touched; inactive SKUs are left alone.
 */

const bodySchema = z.object({
  supplier_id: z.string().uuid(),
  mode: z.enum(["unassigned_only", "overwrite_all"]).default("unassigned_only"),
  category: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }
  const { supplier_id, mode, category } = parsed.data;

  const { data: supplier } = await supabaseAdmin
    .from("suppliers")
    .select("id, name, active")
    .eq("id", supplier_id)
    .maybeSingle();
  if (!supplier) {
    return NextResponse.json({ error: "supplier not found" }, { status: 404 });
  }
  if (!supplier.active) {
    return NextResponse.json({ error: "supplier is inactive" }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("inventory_skus")
    .update({
      preferred_supplier_id: supplier_id,
      updated_at: new Date().toISOString(),
    })
    .eq("active", true);
  if (category) query = query.eq("category", category);
  if (mode === "unassigned_only") query = query.is("preferred_supplier_id", null);

  const { data, error } = await query.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    supplier: { id: supplier.id, name: supplier.name },
    mode,
    category: category ?? null,
    updated_count: (data ?? []).length,
  });
}
