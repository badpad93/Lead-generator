import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET /api/admin/inventory/replenishment/runs/[id]
 *   → run row + every recommendation with its SKU + supplier metadata.
 * This is the replenishment review payload the Phase 5 UI hangs off.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: run, error: runErr } = await supabaseAdmin
    .from("replenishment_runs")
    .select("*, warehouses:warehouse_id(name, code)")
    .eq("id", id)
    .maybeSingle();
  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: recs } = await supabaseAdmin
    .from("replenishment_recommendations")
    .select(
      "*, inventory_skus:sku_id(sku_code, name, category, unit_of_measure, pack_size, preferred_supplier_id), suppliers:supplier_id_used(name, contact_email)",
    )
    .eq("run_id", id)
    .order("recommended_qty", { ascending: false });

  return NextResponse.json({ run, recommendations: recs ?? [] });
}
