import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { resolveCoffeeProductsPricing } from "@/lib/coffeePricing";

/**
 * GET /api/coffee/products — public shopper feed.
 *
 * Prices returned to the caller are resolved against the caller's
 * coffee pricing tier via resolveCoffeeProductsPricing. Unauth
 * callers, or accounts with no tier assigned, resolve to Tier 1.
 *
 * The response shape is unchanged — `price` and `shipping_cost` on
 * each row are overwritten with the tier-resolved values. Downstream
 * clients (shop page, cart drawer) don't need to change.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const idsParam = searchParams.get("ids");

    let query = supabaseAdmin
      .from("coffee_products")
      .select("*, coffee_categories(id, name, slug)")
      .eq("active", true)
      // sort_order first (0 = admin hasn't customized yet); name
      // second as a stable tiebreaker so ties don't render in a
      // random physical-insert order every request.
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    // Explicit id list (used by guest cart / checkout to display line
    // items). Cap at 100 to bound the query and reject empty tokens.
    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
        .slice(0, 100);
      if (ids.length === 0) {
        return NextResponse.json({ products: [] });
      }
      query = query.in("id", ids);
    }

    if (category) {
      const { data: cat } = await supabaseAdmin
        .from("coffee_categories")
        .select("id")
        .eq("slug", category)
        .single();

      if (cat) {
        query = query.eq("category_id", cat.id);
      }
    }

    if (search) {
      const sanitized = search.replace(/[%,.*()]/g, "");
      if (sanitized) {
        query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%,sku.ilike.%${sanitized}%`);
      }
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data || [];
    const userId = await getUserIdFromRequest(req);
    const priced = await resolveCoffeeProductsPricing({
      productIds: rows.map((r: { id: string }) => r.id),
      userId,
    });

    const products = rows.map((r: Record<string, unknown>) => {
      const resolved = priced.get(r.id as string);
      if (!resolved) return r;
      return {
        ...r,
        price: resolved.price,
        shipping_cost: resolved.shipping_cost,
        pricing_tier_id: resolved.pricing_tier_id,
        pricing_tier_key: resolved.tier_key,
      };
    });

    return NextResponse.json({ products });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
