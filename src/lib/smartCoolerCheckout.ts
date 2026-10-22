import { resolveCoffeeProductsPricing } from "@/lib/coffeePricing";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Pricing + line-item assembly for the smart-cooler guest checkout. Delivery
 * is always charged (standard or white-glove); an optional haul-away/relocate
 * fee and optional coffee items ride on the same QuickBooks invoice. Coffee
 * prices are re-resolved server-side (Tier 1 for guests) so the browser can
 * only choose SKU + quantity, never the dollar amount.
 */

export const DELIVERY_STANDARD_CENTS = 37500; // $375 standard delivery
export const DELIVERY_WHITE_GLOVE_CENTS = 50000; // $500 white-glove delivery
export const HAUL_AWAY_CENTS = 25000; // $250 haul away / relocate (within 30 miles)

export interface InvoiceLine {
  description: string;
  amount: number; // unit price in dollars
  quantity?: number;
}

export interface CoffeeItemInput {
  product_id: string;
  quantity: number;
}

export interface ResolvedCoffee {
  lines: InvoiceLine[];
  totalCents: number;
  items: Array<{ product_id: string; name: string; quantity: number; unit_price: number }>;
}

/** Delivery fee for the chosen service level. */
export function deliveryFeeCents(whiteGlove: boolean): number {
  return whiteGlove ? DELIVERY_WHITE_GLOVE_CENTS : DELIVERY_STANDARD_CENTS;
}

/** Normalize raw coffee item input to {product_id, quantity>=1}. */
export function parseCoffeeItems(raw: unknown): CoffeeItemInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CoffeeItemInput[] = [];
  for (const r of raw) {
    const row = r as Record<string, unknown>;
    const productId = typeof row.product_id === "string" ? row.product_id : "";
    const quantity = Math.floor(Number(row.quantity));
    if (/^[0-9a-f-]{36}$/i.test(productId) && Number.isFinite(quantity) && quantity >= 1) {
      out.push({ product_id: productId, quantity: Math.min(quantity, 999) });
    }
  }
  return out;
}

/**
 * Resolve coffee items to invoice lines at guest (Tier 1) pricing. Unknown or
 * inactive products are dropped. Returns lines, the cents total, and a
 * normalized item list for the lead record.
 */
export async function buildCoffeeLines(items: CoffeeItemInput[]): Promise<ResolvedCoffee> {
  if (items.length === 0) return { lines: [], totalCents: 0, items: [] };

  const ids = items.map((i) => i.product_id);
  const { data: products } = await supabaseAdmin
    .from("coffee_products")
    .select("id, name, active")
    .in("id", ids);
  const byId = new Map((products || []).map((p) => [String(p.id), p as { name?: string; active?: boolean }]));

  const priced = await resolveCoffeeProductsPricing({ productIds: ids, userId: null });

  const lines: InvoiceLine[] = [];
  const normalized: ResolvedCoffee["items"] = [];
  let totalCents = 0;
  for (const item of items) {
    const product = byId.get(item.product_id);
    const resolved = priced.get(item.product_id);
    const row = coffeeLineFor(item, product, resolved ? resolved.price : 0);
    if (!row) continue;
    lines.push(row.line);
    normalized.push(row.normalized);
    totalCents += Math.round(row.normalized.unit_price * 100) * item.quantity;
  }
  return { lines, totalCents, items: normalized };
}

/** One priced coffee line, or null if the product is missing/inactive/unpriced. */
function coffeeLineFor(
  item: CoffeeItemInput,
  product: { name?: string; active?: boolean } | undefined,
  unit: number,
): { line: InvoiceLine; normalized: ResolvedCoffee["items"][number] } | null {
  if (!product || product.active === false || unit <= 0) return null;
  const name = product.name || "Coffee product";
  return {
    line: { description: `Coffee — ${name}`, amount: unit, quantity: item.quantity },
    normalized: { product_id: item.product_id, name, quantity: item.quantity, unit_price: unit },
  };
}
