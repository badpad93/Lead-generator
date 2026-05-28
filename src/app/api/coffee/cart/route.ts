import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCoffeeUser, forbiddenResponse } from "@/lib/coffeeAuth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCoffeeUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("coffee_cart_items")
      .select("*, coffee_products(id, name, sku, price, image_url, stock_status, unit, min_order_qty, active)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data || [] });
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

    const { product_id, quantity } = await req.json();

    if (!product_id || !quantity || quantity < 1) {
      return NextResponse.json({ error: "product_id and quantity (>= 1) required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("coffee_cart_items")
      .upsert(
        { user_id: user.id, product_id, quantity, updated_at: new Date().toISOString() },
        { onConflict: "user_id,product_id" }
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCoffeeUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.coffee_access_enabled) {
      return forbiddenResponse();
    }

    const { product_id, clear } = await req.json();

    if (clear) {
      const { error } = await supabaseAdmin
        .from("coffee_cart_items")
        .delete()
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (!product_id) {
      return NextResponse.json({ error: "product_id or clear required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("coffee_cart_items")
      .delete()
      .eq("user_id", user.id)
      .eq("product_id", product_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
