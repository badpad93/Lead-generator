import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCoffeeUser, forbiddenResponse } from "@/lib/coffeeAuth";
import {
  sendCoffeeOrderNotification,
  sendCoffeeOrderConfirmation,
} from "@/lib/coffeeEmail";

export async function GET(req: NextRequest) {
  try {
    const user = await getCoffeeUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("coffee_orders")
      .select("*")
      .eq("operator_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ orders: data || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

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

    await supabaseAdmin
      .from("coffee_cart_items")
      .delete()
      .eq("user_id", user.id);

    const emailParams = {
      orderNumber,
      operatorName: user.full_name || "Operator",
      operatorEmail: user.email || "",
      items: orderItems,
      subtotal,
      shippingEstimate,
      total,
      shippingName: body.shipping_name,
      shippingAddress: body.shipping_address,
      shippingCity: body.shipping_city,
      shippingState: body.shipping_state,
      shippingZip: body.shipping_zip,
    };

    try {
      await Promise.all([
        sendCoffeeOrderNotification(emailParams),
        sendCoffeeOrderConfirmation(emailParams),
      ]);
    } catch {
      // Email failures should not block the order
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
