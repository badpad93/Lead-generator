import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { generateCoffeeTierSheetPdf, type TierSheetItem } from "@/lib/generateCoffeeTierSheetPdf";

/**
 * GET /api/admin/coffee/tier-prices/pdf?tier=<tier_id|tier_key>
 *
 * Admin-only. Exports a printable coffee pricing sheet for one tier: each
 * active product's price is the tier's override (coffee_product_tier_prices)
 * or the product's base price when no override exists. Returns a PDF.
 */
interface Row { id: string; name?: string; sku?: string; price?: number; shipping_cost?: number }
interface TierRow { id: string; tier_key?: string; name?: string }
interface TierPriceRow { product_id: string; price?: number; shipping_cost?: number }

/** Build the per-product sheet rows, applying tier overrides over base price. */
function buildItems(products: Row[], tierPrices: TierPriceRow[]): TierSheetItem[] {
  const override = new Map<string, { price: number; shipping: number }>();
  for (const tp of tierPrices) {
    override.set(String(tp.product_id), { price: Number(tp.price), shipping: Number(tp.shipping_cost || 0) });
  }
  return products.map((p) => {
    const o = override.get(String(p.id));
    return {
      name: p.name || "Product",
      sku: p.sku || null,
      price: o ? o.price : Number(p.price || 0),
      shipping: o ? o.shipping : Number(p.shipping_cost || 0),
    };
  });
}

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tierParam = new URL(req.url).searchParams.get("tier") || "";

  const { data: tiers } = await supabaseAdmin
    .from("coffee_pricing_tiers")
    .select("id, tier_key, name, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  const list = (tiers || []) as TierRow[];
  const tier = list.find((t) => t.id === tierParam || t.tier_key === tierParam) || list[0];
  if (!tier) return NextResponse.json({ error: "No active pricing tiers" }, { status: 404 });

  const [{ data: products }, { data: tierPrices }] = await Promise.all([
    supabaseAdmin
      .from("coffee_products")
      .select("id, name, sku, price, shipping_cost, active, sort_order")
      .eq("active", true)
      .order("sort_order"),
    supabaseAdmin
      .from("coffee_product_tier_prices")
      .select("product_id, pricing_tier_id, price, shipping_cost")
      .eq("pricing_tier_id", tier.id),
  ]);

  const items = buildItems((products || []) as Row[], (tierPrices || []) as TierPriceRow[]);
  const pdf = await generateCoffeeTierSheetPdf({ tierName: String(tier.name), generatedAt: new Date(), items });
  const safeName = String(tier.name).replace(/[^a-z0-9]+/gi, "-");
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Coffee-Pricing-${safeName}.pdf"`,
    },
  });
}
