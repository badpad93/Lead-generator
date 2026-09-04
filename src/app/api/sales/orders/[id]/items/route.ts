import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import {
  computeLineTotal,
  normalizeItemType,
} from "@/lib/pricing/lineItems";
import { refreshAgreementForOrder } from "@/lib/agreements/refresh";
import { resyncOrderTotals } from "@/lib/pricing/orderSync";

/**
 * POST /api/sales/orders/[id]/items — add a line item.
 *
 * Previously this route neither accepted nor applied discount_percent
 * (total_price was qty x unit_price), while POST /api/sales/orders did
 * apply it — so the same item was priced two different ways depending
 * on whether it was added during order creation or afterwards. All
 * money now goes through src/lib/pricing/lineItems.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const qty = Number(body.quantity) || 1;
  const unitPrice = Number(body.unit_price ?? body.price) || 0;
  const discount = Number(body.discount_percent) || 0;
  const totalPrice = computeLineTotal(qty, unitPrice, discount);

  const { data, error } = await supabaseAdmin
    .from("order_items")
    .insert({
      order_id: id,
      service_name: body.item_name || body.service_name || "",
      price: unitPrice,
      item_type: normalizeItemType(body.item_type),
      description: body.description || null,
      quantity: qty,
      unit_price: unitPrice,
      discount_percent: discount,
      total_price: totalPrice,
      status: "pending",
      location_service_price: body.location_service_price || null,
      deposit_required: body.deposit_required || false,
      location_deposit_amount: body.location_deposit_amount || null,
      location_deposit_paid: false,
      location_remaining_balance: body.location_service_price
        ? body.location_service_price - (body.location_deposit_amount || 0)
        : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await resyncOrderTotals(id);

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "item_added",
    description: `Added item: ${body.item_name || body.service_name || "Item"}`,
  });

  // Keep any draft agreement in step with the order it was built from.
  await refreshAgreementForOrder(id, user.id);

  return NextResponse.json(data, { status: 201 });
}
