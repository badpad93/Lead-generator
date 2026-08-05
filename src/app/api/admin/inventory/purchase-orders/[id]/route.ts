import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET   /api/admin/inventory/purchase-orders/[id] — PO + lines + receipts
 * PATCH /api/admin/inventory/purchase-orders/[id] — edit draft fields
 *
 * PATCH only touches draft-state metadata (expected delivery, notes,
 * supplier reference, financial totals). Status transitions live on
 * their own /send /cancel /close /receive endpoints so the state
 * machine can't be sidestepped through a generic UPDATE.
 */

const patchSchema = z.object({
  expected_delivery_date: z.string().nullable().optional(),
  supplier_reference: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  subtotal_cents: z.number().int().min(0).nullable().optional(),
  shipping_cents: z.number().int().min(0).nullable().optional(),
  tax_cents: z.number().int().min(0).nullable().optional(),
  total_cents: z.number().int().min(0).nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [{ data: po, error: poErr }, { data: lines }, { data: receipts }] = await Promise.all([
    supabaseAdmin
      .from("purchase_orders")
      .select("*, suppliers:supplier_id(name, contact_email, contact_phone), warehouses:warehouse_id(name, code)")
      .eq("id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("purchase_order_lines")
      .select("*, inventory_skus:sku_id(sku_code, name, unit_of_measure, pack_size)")
      .eq("purchase_order_id", id)
      .order("line_number", { ascending: true }),
    supabaseAdmin
      .from("purchase_order_receipts")
      .select("*")
      .eq("purchase_order_id", id)
      .order("received_at", { ascending: false }),
  ]);
  if (poErr) return NextResponse.json({ error: poErr.message }, { status: 500 });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    purchase_order: po,
    lines: lines ?? [],
    receipts: receipts ?? [],
  });
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

  const { data: current } = await supabaseAdmin
    .from("purchase_orders")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.status === "cancelled" || current.status === "closed") {
    return NextResponse.json({ error: `cannot edit PO in status ${current.status}` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("purchase_orders")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchase_order: data });
}
