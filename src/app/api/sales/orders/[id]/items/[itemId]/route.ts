import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { computeLineTotal, normalizeItemType } from "@/lib/pricing/lineItems";
import { resyncOrderTotals } from "@/lib/pricing/orderSync";
import { refreshAgreementForOrder } from "@/lib/agreements/refresh";

/**
 * PATCH /api/sales/orders/[id]/items/[itemId]
 *
 * Two bugs fixed here:
 *   1. `const qty = Number(body.quantity) || 1` meant a PATCH carrying
 *      only unit_price wrote total_price = 1 x price while the row's
 *      quantity stayed at 3. The current row is now merged in first, so
 *      a partial update only changes what it names.
 *   2. discount_percent was missing from the allow-list, so a discount
 *      could never be corrected once the line was saved.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, itemId } = await params;
  const body = await req.json();

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("order_items")
    .select("*")
    .eq("id", itemId)
    .eq("order_id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Line item not found" }, { status: 404 });

  const allowed = [
    "item_type", "service_name", "description", "quantity", "unit_price",
    "discount_percent", "status", "location_service_price", "deposit_required",
    "location_deposit_amount", "location_deposit_paid", "location_remaining_balance",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  if ("item_type" in updates) {
    updates.item_type = normalizeItemType(updates.item_type);
  }

  // Recompute the line total whenever any of its inputs moved, reading
  // unchanged inputs off the stored row rather than defaulting them.
  const pricingChanged =
    "quantity" in body || "unit_price" in body || "discount_percent" in body;
  if (pricingChanged) {
    const qty = "quantity" in body ? body.quantity : existing.quantity;
    const unitPrice = "unit_price" in body ? body.unit_price : existing.unit_price;
    const discount =
      "discount_percent" in body ? body.discount_percent : existing.discount_percent;
    updates.total_price = computeLineTotal(qty, unitPrice, discount);
    updates.price = Number(unitPrice) || 0;
  }

  const { data, error } = await supabaseAdmin
    .from("order_items")
    .update(updates)
    .eq("id", itemId)
    .eq("order_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await resyncOrderTotals(id);
  await refreshAgreementForOrder(id, user.id);

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, itemId } = await params;

  const { error } = await supabaseAdmin
    .from("order_items")
    .delete()
    .eq("id", itemId)
    .eq("order_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await resyncOrderTotals(id);

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "item_removed",
    description: "Item removed from order",
  });

  await refreshAgreementForOrder(id, user.id);

  return NextResponse.json({ ok: true });
}
