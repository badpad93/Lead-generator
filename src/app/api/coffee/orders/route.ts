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

    // Business billing address AND shipping address are mandatory for every
    // new order.
    const trim = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
    const requiredFields: Array<[string, string]> = [
      ["billing_business_name", "Billing business name is required"],
      ["billing_contact_name", "Billing contact name is required"],
      ["billing_email", "Billing email is required"],
      ["billing_phone", "Billing phone is required"],
      ["billing_address", "Billing street address is required"],
      ["billing_city", "Billing city is required"],
      ["billing_state", "Billing state is required"],
      ["billing_zip", "Billing zip is required"],
      ["shipping_business_name", "Shipping business name is required"],
      ["shipping_name", "Shipping contact name is required"],
      ["shipping_address", "Shipping street address is required"],
      ["shipping_city", "Shipping city is required"],
      ["shipping_state", "Shipping state is required"],
      ["shipping_zip", "Shipping zip is required"],
      ["shipping_phone", "Shipping phone is required"],
    ];
    for (const [field, message] of requiredFields) {
      if (!trim(body[field])) return NextResponse.json({ error: message }, { status: 400 });
    }
    const billingEmail = trim(body.billing_email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
      return NextResponse.json({ error: "Billing email is not a valid address" }, { status: 400 });
    }

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
        // Ship-to
        shipping_business_name: trim(body.shipping_business_name),
        shipping_name: trim(body.shipping_name),
        shipping_address: trim(body.shipping_address),
        shipping_city: trim(body.shipping_city),
        shipping_state: trim(body.shipping_state),
        shipping_zip: trim(body.shipping_zip),
        shipping_phone: trim(body.shipping_phone),
        // Bill-to
        billing_business_name: trim(body.billing_business_name),
        billing_contact_name: trim(body.billing_contact_name),
        billing_email: trim(body.billing_email),
        billing_phone: trim(body.billing_phone),
        billing_address: trim(body.billing_address),
        billing_city: trim(body.billing_city),
        billing_state: trim(body.billing_state),
        billing_zip: trim(body.billing_zip),
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
      shippingBusinessName: trim(body.shipping_business_name),
      shippingName: trim(body.shipping_name),
      shippingAddress: trim(body.shipping_address),
      shippingCity: trim(body.shipping_city),
      shippingState: trim(body.shipping_state),
      shippingZip: trim(body.shipping_zip),
      shippingPhone: trim(body.shipping_phone),
      billingBusinessName: trim(body.billing_business_name),
      billingContactName: trim(body.billing_contact_name),
      billingEmail: trim(body.billing_email),
      billingPhone: trim(body.billing_phone),
      billingAddress: trim(body.billing_address),
      billingCity: trim(body.billing_city),
      billingState: trim(body.billing_state),
      billingZip: trim(body.billing_zip),
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
