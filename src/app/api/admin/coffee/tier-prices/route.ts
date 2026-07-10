import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET /api/admin/coffee/tier-prices
 *
 * Returns the full tier-price matrix:
 *   tiers  — [{id, tier_key, name, sort_order}, ...] active only
 *   rows   — [{
 *     product_id, product_name, product_sku, base_price, base_shipping_cost,
 *     prices: { <tier_id>: { price, shipping_cost, updated_at, updated_by }},
 *   }, ...]
 * for the admin grid UI. Base price is included so admin can compare
 * tier prices against the legacy coffee_products.price fallback.
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ data: tiers }, { data: products }, { data: tierPrices }] = await Promise.all([
    supabaseAdmin
      .from("coffee_pricing_tiers")
      .select("id, tier_key, name, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabaseAdmin
      .from("coffee_products")
      .select("id, name, sku, price, shipping_cost, active, sort_order")
      .order("sort_order"),
    supabaseAdmin
      .from("coffee_product_tier_prices")
      .select("product_id, pricing_tier_id, price, shipping_cost, updated_at, updated_by"),
  ]);

  const rows = (products || []).map((p) => {
    const prices: Record<string, {
      price: number;
      shipping_cost: number;
      updated_at: string | null;
      updated_by: string | null;
    }> = {};
    for (const tp of tierPrices || []) {
      if (tp.product_id === p.id) {
        prices[tp.pricing_tier_id as string] = {
          price: Number(tp.price),
          shipping_cost: Number(tp.shipping_cost || 0),
          updated_at: tp.updated_at,
          updated_by: tp.updated_by,
        };
      }
    }
    return {
      product_id: p.id,
      product_name: p.name,
      product_sku: p.sku,
      base_price: Number(p.price),
      base_shipping_cost: Number(p.shipping_cost || 0),
      active: p.active !== false,
      prices,
    };
  });

  return NextResponse.json({ tiers: tiers || [], rows });
}

/**
 * PATCH /api/admin/coffee/tier-prices
 * Body: { product_id, pricing_tier_id, price, shipping_cost? }
 *
 * Upserts one (product_id, pricing_tier_id) cell. Editing Tier 2
 * leaves Tier 1 and Tier 3 rows untouched — the unique constraint
 * enforces cell-level isolation. Audit-logs the change with before/after.
 */
export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const productId = typeof body.product_id === "string" ? body.product_id : "";
  const tierId = typeof body.pricing_tier_id === "string" ? body.pricing_tier_id : "";
  const priceRaw = Number(body.price);
  const shippingCostRaw = body.shipping_cost !== undefined && body.shipping_cost !== null
    ? Number(body.shipping_cost)
    : null;

  if (!productId) return NextResponse.json({ error: "product_id is required" }, { status: 400 });
  if (!tierId) return NextResponse.json({ error: "pricing_tier_id is required" }, { status: 400 });
  if (!Number.isFinite(priceRaw) || priceRaw < 0) {
    return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
  }
  if (shippingCostRaw !== null && (!Number.isFinite(shippingCostRaw) || shippingCostRaw < 0)) {
    return NextResponse.json({ error: "shipping_cost must be a non-negative number" }, { status: 400 });
  }

  // Validate FKs exist so we return a clean 400 instead of a cryptic 500.
  const [{ data: product }, { data: tier }] = await Promise.all([
    supabaseAdmin.from("coffee_products").select("id, name, sku").eq("id", productId).maybeSingle(),
    supabaseAdmin.from("coffee_pricing_tiers").select("id, tier_key, name").eq("id", tierId).maybeSingle(),
  ]);
  if (!product) return NextResponse.json({ error: "Unknown product" }, { status: 400 });
  if (!tier) return NextResponse.json({ error: "Unknown pricing tier" }, { status: 400 });

  const { data: before } = await supabaseAdmin
    .from("coffee_product_tier_prices")
    .select("id, price, shipping_cost")
    .eq("product_id", productId)
    .eq("pricing_tier_id", tierId)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    product_id: productId,
    pricing_tier_id: tierId,
    price: priceRaw,
    updated_at: nowIso,
    updated_by: adminId,
  };
  if (shippingCostRaw !== null) payload.shipping_cost = shippingCostRaw;

  const { data: after, error } = await supabaseAdmin
    .from("coffee_product_tier_prices")
    .upsert(payload, { onConflict: "product_id,pricing_tier_id" })
    .select("id, product_id, pricing_tier_id, price, shipping_cost, updated_at, updated_by")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: adminId,
    action: before ? "coffee_tier_price_updated" : "coffee_tier_price_created",
    entity_type: "coffee_product_tier_prices",
    entity_id: after.id,
    before: before
      ? { price: Number(before.price), shipping_cost: Number(before.shipping_cost || 0) }
      : null,
    after: {
      price: Number(after.price),
      shipping_cost: Number(after.shipping_cost || 0),
    },
    metadata: {
      product_id: productId,
      product_name: product.name,
      product_sku: product.sku,
      pricing_tier_id: tierId,
      tier_key: tier.tier_key,
      tier_name: tier.name,
    },
  });

  return NextResponse.json({ ok: true, row: after });
}
