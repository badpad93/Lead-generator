import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, itemId } = await params;
  const body = await req.json();

  const allowed = [
    "item_type", "service_name", "description", "quantity", "unit_price",
    "total_price", "status", "location_service_price", "deposit_required",
    "location_deposit_amount", "location_deposit_paid", "location_remaining_balance",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (body.quantity !== undefined || body.unit_price !== undefined) {
    const qty = Number(body.quantity) || 1;
    const price = Number(body.unit_price) || 0;
    updates.total_price = qty * price;
    updates.price = price;
  }

  const { data, error } = await supabaseAdmin
    .from("order_items")
    .update(updates)
    .eq("id", itemId)
    .eq("order_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalculate order total
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("total_price")
    .eq("order_id", id);

  const newTotal = (items || []).reduce((sum, i) => sum + Number(i.total_price || 0), 0);
  await supabaseAdmin
    .from("sales_orders")
    .update({ total_value: newTotal, remaining_balance: newTotal, updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, itemId } = await params;

  const { error } = await supabaseAdmin
    .from("order_items")
    .delete()
    .eq("id", itemId)
    .eq("order_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalculate order total
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("total_price")
    .eq("order_id", id);

  const newTotal = (items || []).reduce((sum, i) => sum + Number(i.total_price || 0), 0);
  await supabaseAdmin
    .from("sales_orders")
    .update({ total_value: newTotal, remaining_balance: newTotal, updated_at: new Date().toISOString() })
    .eq("id", id);

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "item_removed",
    description: "Item removed from order",
  });

  return NextResponse.json({ ok: true });
}
