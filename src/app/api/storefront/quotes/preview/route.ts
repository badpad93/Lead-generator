import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";
import {
  resolveTenantTierPrices,
  computeQuoteLine,
  computeQuoteTotals,
} from "@/lib/storefront/quotePricing";

/**
 * Live quote recalculation for the operator builder (INTERNAL view — cost
 * + margin included). No persistence. Same resolver the storefront uses, so
 * the preview equals what the customer will see at that tier. Tenant scope
 * comes from the authenticated owner.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No storefront" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    tier?: number;
    lines?: Array<{ product_id: string; quantity: number; override_unit_price?: number | null }>;
  };
  const tier = [1, 2, 3].includes(Number(body.tier)) ? Number(body.tier) : 1;
  const wanted = (Array.isArray(body.lines) ? body.lines : [])
    .map((l) => ({ product_id: String(l.product_id), quantity: Number(l.quantity), override: l.override_unit_price }))
    .filter((l) => l.product_id && Number.isFinite(l.quantity) && l.quantity > 0);

  const priceMap = await resolveTenantTierPrices(tenant.id, tier, wanted.map((w) => w.product_id));
  const lines = wanted
    .map((w) => {
      const info = priceMap.get(w.product_id);
      if (!info) return null;
      const c = computeQuoteLine({
        tierUnitPrice: info.tierUnitPrice,
        overrideUnitPrice: w.override,
        quantity: w.quantity,
        unitCost: info.unitCost,
      });
      return {
        product_id: w.product_id,
        product_name: info.name,
        product_sku: info.sku,
        quantity: c.quantity,
        unit_cost: c.unitCost,
        tier_unit_price: c.tierUnitPrice,
        quoted_unit_price: c.unitPrice,
        is_override: c.isOverride,
        line_total: c.lineTotal,
        gross_profit: c.grossProfit,
        margin_pct: c.marginPct,
      };
    })
    .filter(Boolean);

  const totals = computeQuoteTotals(
    lines.map((l) => ({
      tierUnitPrice: l!.tier_unit_price,
      unitPrice: l!.quoted_unit_price,
      isOverride: l!.is_override,
      quantity: l!.quantity,
      unitCost: l!.unit_cost,
      lineTotal: l!.line_total,
      grossProfit: l!.gross_profit,
      marginPct: l!.margin_pct,
    })),
  );
  return NextResponse.json({ tier, lines, totals });
}
