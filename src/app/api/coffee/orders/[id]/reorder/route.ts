import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCoffeeUser, forbiddenResponse } from "@/lib/coffeeAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCoffeeUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.coffee_access_enabled) {
      return forbiddenResponse();
    }

    const { id } = await params;

    const { data: order, error: orderError } = await supabaseAdmin
      .from("coffee_orders")
      .select("*, coffee_order_items(*)")
      .eq("id", id)
      .eq("operator_id", user.id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const items = order.coffee_order_items as { product_id: string; quantity: number }[];
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items to reorder" }, { status: 400 });
    }

    const productIds = items.map((i) => i.product_id).filter(Boolean);

    const { data: products } = await supabaseAdmin
      .from("coffee_products")
      .select("id")
      .in("id", productIds)
      .eq("active", true)
      .neq("stock_status", "out_of_stock");

    const availableIds = new Set((products || []).map((p: { id: string }) => p.id));

    const cartInserts = items
      .filter((i) => i.product_id && availableIds.has(i.product_id))
      .map((i) => ({
        user_id: user.id,
        product_id: i.product_id,
        quantity: i.quantity,
        updated_at: new Date().toISOString(),
      }));

    if (cartInserts.length === 0) {
      return NextResponse.json({ error: "No products available for reorder" }, { status: 400 });
    }

    const { error: upsertError } = await supabaseAdmin
      .from("coffee_cart_items")
      .upsert(cartInserts, { onConflict: "user_id,product_id" });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      added: cartInserts.length,
      skipped: items.length - cartInserts.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
