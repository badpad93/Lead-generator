import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCoffeeUser } from "@/lib/coffeeAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCoffeeUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const { data: order, error } = await supabaseAdmin
      .from("coffee_orders")
      .select("*, coffee_order_items(*)")
      .eq("id", id)
      .eq("operator_id", user.id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Payment confirmation and the awaiting_payment → pending transition are
    // driven by the QuickBooks payment webhook, not this endpoint. Return the
    // current order so the client polling this route still works.
    return NextResponse.json({ order });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
