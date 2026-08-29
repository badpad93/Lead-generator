import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Fetch primary product rows first. We hydrate junction rows in a
    // second query so a schema-cache miss on the new join table can't
    // break the admin catalog view.
    const { data, error } = await supabaseAdmin
      .from("coffee_products")
      .select("*, coffee_categories!coffee_products_category_id_fkey(id, name, slug)")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];
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

    const products = rows.map((row: Record<string, unknown>) => {
      const linked = categoriesByProduct.get(row.id as string) ?? [];
      const primary = row.coffee_categories as { id: string; name: string; slug: string } | null;
      const categories = linked.length > 0
        ? linked
        : primary
          ? [primary]
          : [];
      const category_ids = categories.map((c) => c.id);
      return { ...row, categories, category_ids };
    });

    return NextResponse.json({ products });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Replace the product's category memberships. Passing an empty array
// clears every category link. Passing a single-item array behaves
// exactly like the legacy category_id write. is_primary marks the
// first (or explicitly-primary) category so the storefront can still
// pick "the" category badge for a product card.
//
// Returns { warning: string | null } — surfaced back to the admin so a
// silent no-op (e.g. junction table doesn't exist because migration
// 160 wasn't run yet) is visible in the UI instead of quietly
// dropping the extra memberships.
async function syncProductCategories(
  productId: string,
  categoryIds: string[],
  primaryId: string | null,
): Promise<{ warning: string | null }> {
  const deduped = Array.from(new Set(categoryIds.filter((s) => /^[0-9a-f-]{36}$/i.test(s))));
  const { error: delErr } = await supabaseAdmin
    .from("coffee_product_categories")
    .delete()
    .eq("product_id", productId);
  if (delErr) {
    console.error("[admin/coffee/products] junction delete failed:", delErr.message);
    return { warning: `Multi-category link table isn't reachable (${delErr.message}). Run migration 160 in Supabase.` };
  }
  if (deduped.length === 0) return { warning: null };
  const primary = primaryId && deduped.includes(primaryId) ? primaryId : deduped[0];
  const rows = deduped.map((cid) => ({
    product_id: productId,
    category_id: cid,
    is_primary: cid === primary,
  }));
  const { error: insErr } = await supabaseAdmin
    .from("coffee_product_categories")
    .insert(rows);
  if (insErr) {
    console.error("[admin/coffee/products] junction insert failed:", insErr.message);
    return { warning: `Extra categories weren't saved (${insErr.message}). Run migration 160 in Supabase.` };
  }
  return { warning: null };
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Accept either the new category_ids array or the legacy single
    // category_id. category_id (on coffee_products itself) is treated
    // as the primary category so the row's badge stays stable.
    const rawIds: string[] = Array.isArray(body.category_ids)
      ? body.category_ids.filter((v: unknown): v is string => typeof v === "string")
      : body.category_id
        ? [String(body.category_id)]
        : [];
    const primaryId: string | null = body.category_id
      ? String(body.category_id)
      : rawIds[0] ?? null;

    const { data, error } = await supabaseAdmin
      .from("coffee_products")
      .insert({
        category_id: primaryId,
        name: body.name,
        sku: body.sku,
        description: body.description ?? null,
        price: body.price,
        shipping_cost: body.shipping_cost ?? 0,
        image_url: body.image_url ?? null,
        stock_status: body.stock_status ?? "in_stock",
        unit: body.unit ?? "each",
        min_order_qty: body.min_order_qty ?? 1,
        active: body.active ?? true,
        sort_order: body.sort_order ?? 0,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let warning: string | null = null;
    if (rawIds.length > 0) {
      const res = await syncProductCategories(data.id, rawIds, primaryId);
      warning = res.warning;
    }

    return NextResponse.json({ product: data, warning }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const allowedFields = [
      "category_id", "name", "sku", "description", "price", "shipping_cost", "image_url",
      "stock_status", "unit", "min_order_qty", "active", "sort_order",
    ];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (field in fields) updates[field] = fields[field];
    }

    const { data, error } = await supabaseAdmin
      .from("coffee_products")
      .update(updates)
      .eq("id", id)
      .select("*, coffee_categories!coffee_products_category_id_fkey(id, name, slug)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sync the many-to-many category memberships when the caller sent
    // an explicit list. Omitting category_ids from the PATCH body
    // leaves the memberships untouched (so a PATCH that only edits
    // the name / price doesn't wipe categories).
    let warning: string | null = null;
    if ("category_ids" in fields && Array.isArray(fields.category_ids)) {
      const rawIds: string[] = (fields.category_ids as unknown[]).filter(
        (v): v is string => typeof v === "string",
      );
      const primaryId: string | null =
        typeof fields.category_id === "string" ? fields.category_id : rawIds[0] ?? null;
      const res = await syncProductCategories(id, rawIds, primaryId);
      warning = res.warning;
    }

    // Propagate base price + shipping to the Tier 1 tier-price row.
    // Marketplace resolver (src/lib/coffeePricing.ts) reads from
    // coffee_product_tier_prices, not from coffee_products.price, so
    // without this write the admin's edit is invisible to shoppers.
    // Tier-specific pricing (Tier 2 / Tier 3) is still managed at
    // /admin/coffee/tier-prices and is not touched here.
    const priceChanged = "price" in fields;
    const shippingChanged = "shipping_cost" in fields;
    if (priceChanged || shippingChanged) {
      try {
        const { data: tier1 } = await supabaseAdmin
          .from("coffee_pricing_tiers")
          .select("id")
          .eq("tier_key", "tier_1")
          .maybeSingle();
        if (tier1) {
          const tierPatch: Record<string, unknown> = {
            product_id: id,
            pricing_tier_id: tier1.id,
            updated_by: adminId,
            updated_at: new Date().toISOString(),
          };
          if (priceChanged) tierPatch.price = fields.price;
          if (shippingChanged) tierPatch.shipping_cost = fields.shipping_cost;
          await supabaseAdmin
            .from("coffee_product_tier_prices")
            .upsert(tierPatch, { onConflict: "product_id,pricing_tier_id" });
        }
      } catch (tierErr) {
        // Non-fatal — base price is already saved. Admin can still
        // edit the tier price directly at /admin/coffee/tier-prices.
        console.error("[admin/coffee/products] tier-1 propagation failed:", tierErr);
      }
    }

    return NextResponse.json({ product: data, warning });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    // Remove from any carts first
    await supabaseAdmin
      .from("coffee_cart_items")
      .delete()
      .eq("product_id", id);

    // Try hard delete
    const { error } = await supabaseAdmin
      .from("coffee_products")
      .delete()
      .eq("id", id);

    if (error) {
      // Foreign key constraint from order items — soft-delete instead
      const { error: deactivateErr } = await supabaseAdmin
        .from("coffee_products")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (deactivateErr) {
        return NextResponse.json({ error: deactivateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, deactivated: true });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
