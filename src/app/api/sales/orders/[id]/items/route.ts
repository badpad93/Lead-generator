import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const qty = Number(body.quantity) || 1;
  const unitPrice = Number(body.unit_price) || 0;
  const totalPrice = qty * unitPrice;

  const { data, error } = await supabaseAdmin
    .from("order_items")
    .insert({
      order_id: id,
      service_name: body.item_name || body.service_name || "",
      price: unitPrice,
      item_type: body.item_type || "other",
      description: body.description || null,
      quantity: qty,
      unit_price: unitPrice,
      total_price: totalPrice,
      status: "pending",
      location_service_price: body.location_service_price || null,
      deposit_required: body.deposit_required || false,
      location_deposit_amount: body.location_deposit_amount || null,
      location_deposit_paid: false,
      location_remaining_balance: body.location_service_price
        ? (body.location_service_price - (body.location_deposit_amount || 0))
        : null,
    })
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

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "item_added",
    description: `Added item: ${body.item_name || body.service_name || "Item"}`,
  });

  return NextResponse.json(data, { status: 201 });
}
