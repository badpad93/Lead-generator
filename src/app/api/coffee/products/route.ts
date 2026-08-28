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

    // NOTE: we intentionally do NOT nest coffee_product_categories in
    // this select. PostgREST caches the schema and a brand-new join
    // table (migration 160) may not be recognized in the cache
    // immediately after the migration runs — nesting the relation
    // would then error the whole request and the storefront would go
    // empty. Instead we fetch the primary product row first and merge
    // the extra category memberships in a second best-effort query.
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
        // Resolve every product in this category through the junction
        // table (many-to-many). If the junction table isn't reachable
        // (missing, schema cache stale, RLS wrong), fall back to the
        // legacy single-category filter so the storefront doesn't
        // suddenly return zero products.
        const { data: linkRows, error: linkErr } = await supabaseAdmin
          .from("coffee_product_categories")
          .select("product_id")
          .eq("category_id", cat.id);
        if (linkErr) {
          query = query.eq("category_id", cat.id);
        } else {
          const productIds = (linkRows || [])
            .map((r: { product_id: string }) => r.product_id)
            .filter((id): id is string => typeof id === "string");
          if (productIds.length === 0) {
            // Nothing in the junction table for this category — still
            // fall back to legacy single-category so admin-created
            // rows made before backfill also render.
            query = query.eq("category_id", cat.id);
          } else {
            query = query.in("id", productIds);
          }
        }
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

    // Best-effort category-array hydration. Two failure modes both
    // resolve to "just use the primary coffee_categories row we
    // already have" — a missing junction table (schema cache), or an
    // empty junction (no backfill yet).
    const categoriesByProduct = new Map<string, Array<{ id: string; name: string; slug: string }>>();
    if (rows.length > 0) {
      const { data: junctionRows } = await supabaseAdmin
        .from("coffee_product_categories")
        .select("product_id, coffee_categories(id, name, slug)")
        .in("product_id", rows.map((r: { id: string }) => r.id));
      for (const link of ((junctionRows || []) as unknown as Array<{
        product_id: string;
        coffee_categories: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null;
      }>)) {
        const cat = Array.isArray(link.coffee_categories)
          ? link.coffee_categories[0]
          : link.coffee_categories;
        if (!cat) continue;
        const list = categoriesByProduct.get(link.product_id) ?? [];
        list.push(cat);
        categoriesByProduct.set(link.product_id, list);
      }
    }

    const products = rows.map((r: Record<string, unknown>) => {
      const linkedCategories = categoriesByProduct.get(r.id as string) ?? [];
      const primary = r.coffee_categories as { id: string; name: string; slug: string } | null;
      const categories = linkedCategories.length > 0
        ? linkedCategories
        : primary
          ? [primary]
          : [];
      const base = { ...r, categories };
      const resolved = priced.get(r.id as string);
      if (!resolved) return base;
      return {
        ...base,
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
