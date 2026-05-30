import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
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

    if (order.status !== "awaiting_payment") {
      return NextResponse.json({ order });
    }

    if (!order.stripe_checkout_session_id) {
      return NextResponse.json({ order });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);

    if (session.payment_status !== "paid") {
      return NextResponse.json({ order });
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    const { data: updated } = await supabaseAdmin
      .from("coffee_orders")
      .update({
        status: "pending",
        stripe_payment_intent_id: paymentIntentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "awaiting_payment")
      .select("*, coffee_order_items(*)")
      .single();

    if (!updated) {
      const { data: current } = await supabaseAdmin
        .from("coffee_orders")
        .select("*, coffee_order_items(*)")
        .eq("id", id)
        .single();
      return NextResponse.json({ order: current });
    }

    if (user.id) {
      await supabaseAdmin
        .from("coffee_cart_items")
        .delete()
        .eq("user_id", user.id);
    }

    try {
      const { sendCoffeeOrderNotification, sendCoffeeOrderConfirmation } = await import("@/lib/coffeeEmail");

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("id", updated.operator_id)
        .single();

      const emailParams = {
        orderNumber: updated.order_number,
        operatorName: profile?.full_name || "Operator",
        operatorEmail: profile?.email || user.email || "",
        items: (updated.coffee_order_items || []).map((i: Record<string, unknown>) => ({
          product_name: i.product_name as string,
          product_sku: i.product_sku as string,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          line_total: Number(i.line_total),
        })),
        subtotal: Number(updated.subtotal),
        shippingEstimate: Number(updated.shipping_estimate),
        total: Number(updated.total),
        shippingName: updated.shipping_name,
        shippingAddress: updated.shipping_address,
        shippingCity: updated.shipping_city,
        shippingState: updated.shipping_state,
        shippingZip: updated.shipping_zip,
      };

      await Promise.all([
        sendCoffeeOrderNotification(emailParams),
        sendCoffeeOrderConfirmation(emailParams),
      ]);
    } catch (e) {
      console.error("[confirm] Failed to send coffee order emails:", e);
    }

    return NextResponse.json({ order: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
