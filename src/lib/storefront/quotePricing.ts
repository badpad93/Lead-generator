/**
 * Quote pricing — reuses the storefront's pricing model so a quoted
 * price can never diverge from what the customer later sees logged in.
 *
 * Customer unit price for tier N = storefront_tenant_tier_prices[tenant,N,product]
 * else the product list price (coffee_products.price) — EXACTLY the tier
 * branch of applyStorefrontOverlay in coffeePricing.ts. Operator cost basis
 * = the tenant's base pricing tier price (coffee_product_tier_prices for
 * tenant.base_pricing_tier_id) else the list price — the same "base_price"
 * the resolver reports; gross profit = customer price − cost.
 *
 * The compute* helpers are pure so tier recalculation, one-time overrides,
 * and margin math are unit-testable without a database.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { round2 } from "@/lib/coffeePricing";

export interface TierPriceInfo {
  productId: string;
  name: string;
  sku: string | null;
  /** Resolved customer price for the selected tier. */
  tierUnitPrice: number;
  /** Operator wholesale/base cost basis (internal only). */
  unitCost: number;
}

export interface QuoteLineInput {
  tierUnitPrice: number;
  /** Operator's one-time quoted price; when set and ≠ tier price, it's an override. */
  overrideUnitPrice?: number | null;
  quantity: number;
  unitCost?: number;
}

export interface QuoteLineComputed {
  tierUnitPrice: number;
  unitPrice: number;
  isOverride: boolean;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  grossProfit: number;
  marginPct: number;
}

/** Pure per-line economics. Override applies ONLY to this line/quote. */
export function computeQuoteLine(input: QuoteLineInput): QuoteLineComputed {
  const tierUnitPrice = round2(Math.max(0, Number(input.tierUnitPrice) || 0));
  const qty = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const unitCost = round2(Math.max(0, Number(input.unitCost) || 0));

  const rawOverride = input.overrideUnitPrice;
  const hasOverride =
    rawOverride != null &&
    Number.isFinite(Number(rawOverride)) &&
    round2(Math.max(0, Number(rawOverride))) !== tierUnitPrice;
  const unitPrice = hasOverride ? round2(Math.max(0, Number(rawOverride))) : tierUnitPrice;

  const lineTotal = round2(unitPrice * qty);
  const grossProfit = round2((unitPrice - unitCost) * qty);
  const marginPct = unitPrice > 0 ? round2(((unitPrice - unitCost) / unitPrice) * 100) : 0;

  return { tierUnitPrice, unitPrice, isOverride: hasOverride, quantity: qty, unitCost, lineTotal, grossProfit, marginPct };
}

export interface QuoteTotals {
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  estCost: number;
  estGrossProfit: number;
  marginPct: number;
}

/** Pure quote totals + blended margin. */
export function computeQuoteTotals(
  lines: QuoteLineComputed[],
  opts?: { tax?: number; shipping?: number },
): QuoteTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const estCost = round2(lines.reduce((s, l) => s + l.unitCost * l.quantity, 0));
  const estGrossProfit = round2(lines.reduce((s, l) => s + l.grossProfit, 0));
  const tax = round2(Math.max(0, opts?.tax ?? 0));
  const shipping = round2(Math.max(0, opts?.shipping ?? 0));
  const total = round2(subtotal + tax + shipping);
  const marginPct = subtotal > 0 ? round2((estGrossProfit / subtotal) * 100) : 0;
  return { subtotal, tax, shipping, total, estCost, estGrossProfit, marginPct };
}

/** Operator base cost per product = tenant's base-tier price, when configured. */
async function loadBaseCosts(baseTierId: string | null, ids: string[]): Promise<Map<string, number>> {
  const costs = new Map<string, number>();
  if (!baseTierId) return costs;
  const { data } = await supabaseAdmin
    .from("coffee_product_tier_prices")
    .select("product_id, price")
    .eq("pricing_tier_id", baseTierId)
    .in("product_id", ids);
  for (const r of (data || []) as Array<{ product_id: string; price: number }>) {
    costs.set(r.product_id, Number(r.price));
  }
  return costs;
}

/**
 * Resolve tier price + base cost for a set of products at a given tier,
 * reusing the storefront pricing tables. Server-only (service role).
 */
export async function resolveTenantTierPrices(
  tenantId: string,
  tier: number,
  productIds: string[],
): Promise<Map<string, TierPriceInfo>> {
  const out = new Map<string, TierPriceInfo>();
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  if (ids.length === 0) return out;

  const [tenantResp, productsResp, tierPriceResp] = await Promise.all([
    supabaseAdmin.from("storefront_tenants").select("id, base_pricing_tier_id").eq("id", tenantId).maybeSingle(),
    supabaseAdmin.from("coffee_products").select("id, name, sku, price").in("id", ids),
    supabaseAdmin
      .from("storefront_tenant_tier_prices")
      .select("product_id, customer_price")
      .eq("tenant_id", tenantId)
      .eq("tier", tier)
      .in("product_id", ids),
  ]);

  const products = new Map(
    ((productsResp.data || []) as Array<{ id: string; name: string; sku: string | null; price: number }>).map((p) => [p.id, p]),
  );
  const tierPrices = new Map(
    ((tierPriceResp.data || []) as Array<{ product_id: string; customer_price: number }>).map((r) => [r.product_id, Number(r.customer_price)]),
  );
  const baseTierId = (tenantResp.data as { base_pricing_tier_id: string | null } | null)?.base_pricing_tier_id ?? null;
  const baseCosts = await loadBaseCosts(baseTierId, ids);

  const pick = (m: Map<string, number>, id: string, fallback: number): number =>
    round2(m.has(id) ? (m.get(id) as number) : fallback);

  for (const id of ids) {
    const p = products.get(id);
    if (!p) continue; // unknown/foreign product — caller filters these out
    const listPrice = round2(Number(p.price) || 0);
    out.set(id, {
      productId: id,
      name: p.name,
      sku: p.sku ?? null,
      tierUnitPrice: pick(tierPrices, id, listPrice),
      unitCost: pick(baseCosts, id, listPrice),
    });
  }
  return out;
}
