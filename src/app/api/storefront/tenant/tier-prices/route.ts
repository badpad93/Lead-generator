import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";

/**
 * Owner CRUD for the storefront's three pricing tiers (migration 185).
 *
 * GET  -> { tiers: { "1": {product_id: price}, "2": {...}, "3": {...} },
 *          tier_names: { "1": name, ... }, base_prices: {product_id: cost} }
 * PUT  -> { entries?: [{ tier, product_id, customer_price }],
 *          tier_names?: { "1": name, ... } }
 *
 * "base" is the owner's true cost (assigned base_pricing_tier, else
 * list price) — the same figure the checkout commission floor uses,
 * so the owner sees real margin. A tier cell left unset falls back to
 * the product list price at checkout; the owner only fills a cell to
 * differ from list.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const { data: rows } = await supabaseAdmin
    .from("storefront_tenant_tier_prices")
    .select("tier, product_id, customer_price")
    .eq("tenant_id", tenant.id);

  const tiers: Record<string, Record<string, number>> = { "1": {}, "2": {}, "3": {} };
  for (const r of (rows ?? []) as Array<{ tier: number; product_id: string; customer_price: number }>) {
    (tiers[String(r.tier)] ??= {})[r.product_id] = Number(r.customer_price);
  }

  // True per-product base cost: assigned tier price, else list price.
  const basePrices: Record<string, number> = {};
  const { data: products } = await supabaseAdmin
    .from("coffee_products")
    .select("id, price")
    .eq("active", true);
  for (const p of (products ?? []) as Array<{ id: string; price: number | null }>) {
    if (p.price != null) basePrices[p.id] = Number(p.price);
  }
  if (tenant.base_pricing_tier_id) {
    const { data: tierRows } = await supabaseAdmin
      .from("coffee_product_tier_prices")
      .select("product_id, price")
      .eq("pricing_tier_id", tenant.base_pricing_tier_id)
      .eq("is_active", true);
    for (const row of (tierRows ?? []) as Array<{ product_id: string; price: number }>) {
      basePrices[row.product_id] = Number(row.price);
    }
  }

  const tenantRow = tenant as { price_tier_names?: Record<string, string> };
  const tierNames = tenantRow.price_tier_names ?? { "1": "Tier 1", "2": "Tier 2", "3": "Tier 3" };

  return NextResponse.json({ tiers, tier_names: tierNames, base_prices: basePrices });
}

interface PutBody {
  entries?: Array<{ tier: number; product_id: string; customer_price: number }>;
  tier_names?: Record<string, string>;
}

export async function PUT(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as PutBody | null;
  if (!body) return NextResponse.json({ error: "Bad body" }, { status: 400 });

  const entries = (body.entries ?? []).filter(
    (e) =>
      Number.isInteger(e.tier) &&
      e.tier >= 1 &&
      e.tier <= 3 &&
      typeof e.product_id === "string" &&
      e.product_id &&
      Number.isFinite(e.customer_price) &&
      e.customer_price >= 0,
  );
  if (entries.length > 0) {
    const { error } = await supabaseAdmin
      .from("storefront_tenant_tier_prices")
      .upsert(
        entries.map((e) => ({
          tenant_id: tenant.id,
          tier: e.tier,
          product_id: e.product_id,
          customer_price: e.customer_price,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        })),
        { onConflict: "tenant_id,tier,product_id" },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.tier_names && typeof body.tier_names === "object") {
    const clean: Record<string, string> = {};
    for (const k of ["1", "2", "3"]) {
      const v = body.tier_names[k];
      clean[k] = typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : `Tier ${k}`;
    }
    const { error } = await supabaseAdmin
      .from("storefront_tenants")
      .update({ price_tier_names: clean, updated_at: new Date().toISOString() })
      .eq("id", tenant.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: entries.length });
}
