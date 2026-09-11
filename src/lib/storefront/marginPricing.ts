/**
 * Markup% ↔ Gross-margin% ↔ selling-price math for storefront pricing
 * controls (admin storefront pricing + admin/owner quote lines).
 *
 * Two modes select how a single entered percentage turns a known unit COST
 * into a customer SELLING PRICE:
 *
 *   markup:  price = cost × (1 + pct/100)      pct = (price−cost)/cost × 100
 *   margin:  price = cost ÷ (1 − pct/100)      pct = (price−cost)/price × 100
 *
 * All monetary results use round2 — the repo's shared rounding rule
 * (`Math.round((n + EPSILON) * 100) / 100`), kept as a local copy here exactly
 * as coffeePricing.ts / pricing/lineItems.ts / commerce/quotePricing.ts each
 * do, so this module stays pure and env-free (importable in unit tests without
 * the Supabase env) while rounding identically to the rest of the money stack.
 * Percentages are plain numbers (25 means 25%).
 *
 * Everything is null-safe: a zero/missing cost, a zero price, a margin at or
 * beyond 100%, or a negative input never yields Infinity / NaN / a throw —
 * the affected derived value comes back as null and `valid` is false with a
 * machine-readable `reason`. Callers render "—" for a null and must not
 * persist an invalid breakdown.
 */

/** Shared cents rounding — identical to the repo's other round2 copies. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type PricingMode = "markup" | "margin";

export const PRICING_MODES: readonly PricingMode[] = ["markup", "margin"] as const;

export function isPricingMode(v: unknown): v is PricingMode {
  return v === "markup" || v === "margin";
}

/** A finite number, else null. */
function fin(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

/** Coerce to a finite number or null (blank/NaN/±Infinity → null). */
export function toFiniteOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Selling price for a cost + percentage under a mode. Returns null when it
 * cannot be computed meaningfully:
 *   - cost is null/negative (a missing cost has no price basis)
 *   - margin mode with pct ≥ 100 (division by zero / negative denominator)
 * A zero cost is allowed (yields 0). Negative pct (discount / below-cost) and
 * large markups are allowed.
 */
export function computeSellingPrice(
  cost: number | null | undefined,
  pct: number | null | undefined,
  mode: PricingMode,
): number | null {
  const c = toFiniteOrNull(cost);
  const p = toFiniteOrNull(pct);
  if (c === null || c < 0 || p === null) return null;
  if (mode === "markup") {
    return round2(c * (1 + p / 100));
  }
  // margin
  if (p >= 100) return null; // 100% margin is unreachable; beyond is negative denominator
  const denom = 1 - p / 100;
  if (denom <= 0) return null;
  return fin(round2(c / denom));
}

/** Equivalent MARKUP % for a cost→price pair. null when cost ≤ 0. */
export function equivalentMarkupPct(
  cost: number | null | undefined,
  price: number | null | undefined,
): number | null {
  const c = toFiniteOrNull(cost);
  const s = toFiniteOrNull(price);
  if (c === null || s === null || c <= 0) return null;
  return round2(((s - c) / c) * 100);
}

/** Equivalent GROSS-MARGIN % for a cost→price pair. null when price ≤ 0. */
export function equivalentMarginPct(
  cost: number | null | undefined,
  price: number | null | undefined,
): number | null {
  const c = toFiniteOrNull(cost);
  const s = toFiniteOrNull(price);
  if (c === null || s === null || s <= 0) return null;
  return round2(((s - c) / s) * 100);
}

/** Per-unit gross profit (price − cost), rounded. null when either is null. */
export function unitGrossProfit(
  cost: number | null | undefined,
  price: number | null | undefined,
): number | null {
  const c = toFiniteOrNull(cost);
  const s = toFiniteOrNull(price);
  if (c === null || s === null) return null;
  return round2(s - c);
}

/**
 * Given a known cost and an existing selling price, recover the percentage a
 * control should show for the chosen mode (so an already-priced line opens
 * with the right slider value). null when it can't be derived.
 */
export function pctFromPrice(
  cost: number | null | undefined,
  price: number | null | undefined,
  mode: PricingMode,
): number | null {
  return mode === "markup" ? equivalentMarkupPct(cost, price) : equivalentMarginPct(cost, price);
}

export interface PriceBreakdown {
  /** Whether the inputs produce a usable selling price. */
  valid: boolean;
  reason?: "missing_cost" | "negative_cost" | "missing_pct" | "margin_ge_100";
  cost: number | null;
  mode: PricingMode;
  pct: number | null;
  sellingPrice: number | null;
  markupPct: number | null;
  marginPct: number | null;
  unitGrossProfit: number | null;
  quantity: number;
  lineTotal: number | null;
  lineGrossProfit: number | null;
  /** True when the resulting price is below cost (negative margin). */
  belowCost: boolean;
}

/** Quantity ≥ 1 integer; blank/zero/negative default to 1. */
function normalizeQuantity(v: unknown): number {
  const n = toFiniteOrNull(v);
  return n !== null && n > 0 ? Math.floor(n) : 1;
}

/** First blocking reason for a breakdown, or undefined when computable. */
function breakdownReason(
  cost: number | null,
  pct: number | null,
  mode: PricingMode,
): PriceBreakdown["reason"] | undefined {
  if (cost === null) return "missing_cost";
  if (cost < 0) return "negative_cost";
  if (pct === null) return "missing_pct";
  if (mode === "margin" && pct >= 100) return "margin_ge_100";
  return undefined;
}

function isBelowCost(cost: number | null, price: number | null): boolean {
  return cost !== null && price !== null && price < cost;
}

/**
 * Full readout for a pricing control: the selling price plus BOTH equivalent
 * percentages, per-unit gross profit, and line totals for a quantity. Pure
 * and total — always returns an object; `valid=false` (+`reason`) when the
 * price can't be computed. Never throws, never returns NaN/Infinity.
 */
export function priceBreakdown(input: {
  cost: number | null | undefined;
  pct: number | null | undefined;
  mode: PricingMode;
  quantity?: number | null;
}): PriceBreakdown {
  const cost = toFiniteOrNull(input.cost);
  const pct = toFiniteOrNull(input.pct);
  const quantity = normalizeQuantity(input.quantity);
  const mode = input.mode;

  const reason = breakdownReason(cost, pct, mode);
  const sellingPrice = reason ? null : computeSellingPrice(cost, pct, mode);
  const ugp = unitGrossProfit(cost, sellingPrice);

  return {
    valid: sellingPrice !== null,
    reason,
    cost,
    mode,
    pct,
    sellingPrice,
    markupPct: equivalentMarkupPct(cost, sellingPrice),
    marginPct: equivalentMarginPct(cost, sellingPrice),
    unitGrossProfit: ugp,
    quantity,
    lineTotal: sellingPrice === null ? null : round2(sellingPrice * quantity),
    lineGrossProfit: ugp === null ? null : round2(ugp * quantity),
    belowCost: isBelowCost(cost, sellingPrice),
  };
}
