import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * POST /api/sales/deals/[id]/finalize
 * Creates an order from the deal's services, then triggers send.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: dealId } = await params;
  const body = await req.json();
  const { recipient_email, notes } = body;

  // Fetch deal + services
  const { data: deal, error: dealErr } = await supabaseAdmin
    .from("sales_deals")
    .select("*, deal_services(*)")
    .eq("id", dealId)
    .single();

  if (dealErr || !deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const services = deal.deal_services || [];
  if (services.length === 0) {
    return NextResponse.json({ error: "No services to order" }, { status: 400 });
  }

  const total = services.reduce((sum: number, s: { price: number }) => sum + Number(s.price), 0);

  // Create order
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .insert({
      deal_id: dealId,
      account_id: deal.account_id || null,
      created_by: user.id,
      total_value: total,
      status: "draft",
      recipient_email: recipient_email || "james@apexaivending.com",
      notes: notes || null,
    })
    .select("id")
    .single();

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

  // Create order items from deal services
  const orderItems = services.map((s: { service_name: string; price: number }) => ({
    order_id: order.id,
    service_name: s.service_name,
    price: s.price,
    notes: null,
  }));

  await supabaseAdmin.from("order_items").insert(orderItems);

  return NextResponse.json({ orderId: order.id }, { status: 201 });
}
