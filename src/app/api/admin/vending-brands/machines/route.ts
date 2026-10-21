import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * Smart cooler → brand assignment. The brand lineup is the Smart Coolers (AI
 * cooler) inventory; assigning sets smart_cooler_machines.brand_id.
 */

/** GET /api/admin/vending-brands/machines — AI coolers for the assignment UI. */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("id, name, active, price_cents, listing_id, brand_id")
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ machines: data || [] });
}

/** PATCH /api/admin/vending-brands/machines — set a cooler's brand_id. */
export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const machineId = body.machine_id as string | undefined;
  if (!machineId) return NextResponse.json({ error: "machine_id required" }, { status: 400 });
  const brandId = (body.brand_id as string | null) ?? null;

  const { error } = await supabaseAdmin
    .from("smart_cooler_machines")
    .update({ brand_id: brandId })
    .eq("id", machineId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
