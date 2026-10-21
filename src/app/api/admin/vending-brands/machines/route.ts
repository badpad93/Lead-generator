import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * Machine → brand assignment. Machines are the existing `machine_listings`;
 * assigning sets machine_listings.brand_id.
 */

/** GET /api/admin/vending-brands/machines — listings for the assignment UI. */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("machine_listings")
    .select("id, title, status, buy_now_enabled, buy_now_price, asking_price, image_thumb_url, brand_id")
    .order("title", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ machines: data || [] });
}

/** PATCH /api/admin/vending-brands/machines — set a listing's brand_id. */
export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const machineId = body.machine_id as string | undefined;
  if (!machineId) return NextResponse.json({ error: "machine_id required" }, { status: 400 });
  const brandId = (body.brand_id as string | null) ?? null;

  const { error } = await supabaseAdmin
    .from("machine_listings")
    .update({ brand_id: brandId })
    .eq("id", machineId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
