import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCoffeeUser, forbiddenResponse } from "@/lib/coffeeAuth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const user = await getCoffeeUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.coffee_access_enabled) {
      return forbiddenResponse();
    }

    const body = await req.json();

    const { data: cartItems, error: cartError } = await supabaseAdmin
      .from("coffee_cart_items")
      .select("*, coffee_products(id, name, sku, price, active, stock_status)")
      .eq("user_id", user.id);

    if (cartError) {
      return NextResponse.json({ error: cartError.message }, { status: 500 });
    }

    if (!cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const validItems = cartItems.filter((item: Record<string, unknown>) => {
      const product = item.coffee_products as Record<string, unknown>;
      return product.active === true && product.stock_status !== "out_of_stock";
    });

    if (validItems.length === 0) {
      return NextResponse.json({ error: "All items in your cart are unavailable" }, { status: 400 });
    }

    const orderNumber = `VC-${Date.now()}`;

    const orderItems = validItems.map((item: Record<string, unknown>) => {
      const product = item.coffee_products as Record<string, unknown>;
      const unitPrice = Number(product.price);
      const quantity = Number(item.quantity);
      return {
        product_id: product.id as string,
        product_name: product.name as string,
        product_sku: product.sku as string,
        quantity,
        unit_price: unitPrice,
        line_total: unitPrice * quantity,
      };
    });

    const subtotal = orderItems.reduce((sum, i) => sum + i.line_total, 0);
    const shippingEstimate = body.shipping_estimate ?? 0;
    const total = subtotal + shippingEstimate;

    const { data: order, error: orderError } = await supabaseAdmin
      .from("coffee_orders")
      .insert({
        operator_id: user.id,
        order_number: orderNumber,
        status: "awaiting_payment",
        shipping_name: body.shipping_name ?? null,
        shipping_address: body.shipping_address ?? null,
        shipping_city: body.shipping_city ?? null,
        shipping_state: body.shipping_state ?? null,
        shipping_zip: body.shipping_zip ?? null,
        shipping_phone: body.shipping_phone ?? null,
        subtotal,
        shipping_estimate: shippingEstimate,
        total,
        notes: body.notes ?? null,
      })
      .select("*")
      .single();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    const itemsWithOrderId = orderItems.map((item) => ({
      ...item,
      order_id: order.id,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from("coffee_order_items")
      .insert(itemsWithOrderId);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = orderItems.map((item) => ({
      price_data: {
        currency: "usd",
        unit_amount: Math.round(item.unit_price * 100),
        product_data: {
          name: item.product_name,
          description: `SKU: ${item.product_sku}`,
        },
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      metadata: {
        type: "coffee_order",
        order_id: order.id,
        order_number: orderNumber,
        user_id: user.id,
      },
      customer_email: user.email || undefined,
      success_url: `${siteUrl}/coffee/orders/${order.id}?paid=true`,
      cancel_url: `${siteUrl}/coffee/checkout?canceled=true`,
    });

    await supabaseAdmin
      .from("coffee_orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
