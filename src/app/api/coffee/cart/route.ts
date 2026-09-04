import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCoffeeUser, hasCoffeePurchaseAccess, forbiddenResponse } from "@/lib/coffeeAuth";
import { resolveCoffeeProductsPricing } from "@/lib/coffeePricing";

export async function GET(req: NextRequest) {
  try {
    const user = await getCoffeeUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("coffee_cart_items")
      .select("*, coffee_products(id, name, sku, price, shipping_cost, image_url, stock_status, unit, min_order_qty, active)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Overwrite the joined product's price + shipping_cost with the
    // caller's tier-resolved values. The cart itself stores only
    // quantity + product_id — pricing is always live, so no cart
    // migration is needed when tiers change.
    const items = (data || []) as Array<Record<string, unknown> & {
      product_id: string;
      coffee_products: { id: string; price: number; shipping_cost: number } & Record<string, unknown>;
    }>;
    if (items.length > 0) {
      const priced = await resolveCoffeeProductsPricing({
        productIds: items.map((i) => i.product_id),
        userId: user.id,
      });
      for (const item of items) {
        const r = priced.get(item.product_id);
        if (r && item.coffee_products) {
          item.coffee_products = {
            ...item.coffee_products,
            price: r.price,
            shipping_cost: r.shipping_cost,
          };
        }
      }
    }

    return NextResponse.json({ items });
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
    if (!hasCoffeePurchaseAccess(user)) {
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
    if (!hasCoffeePurchaseAccess(user)) {
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
