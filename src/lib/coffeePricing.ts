import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Coffee product pricing resolver — the single source of truth for
 * what price a given account sees / pays for a given coffee product.
 *
 * Fallback chain:
 *   1. Active tier price for the account's assigned tier
 *   2. Active Tier 1 price (the default/floor)
 *   3. coffee_products.price (bootstrap fallback for products with no
 *      tier prices seeded yet — shouldn't happen post-migration 118)
 *   4. 0 (last-resort — flagged as fallback_used=true)
 *
 * Money is Postgres NUMERIC → JS number here. That matches the rest of
 * the coffee stack; Stripe/QB integrations convert to cents at the
 * boundary (Math.round(x * 100)).
 */

export interface ResolvedPricing {
  product_id: string;
  pricing_tier_id: string | null;
  tier_key: string | null;
  tier_name: string | null;
  price: number;
  shipping_cost: number;
  currency: "USD";
  fallback_used: boolean;
  fallback_reason: string | null;
}

interface TierRow {
  id: string;
  tier_key: string;
  name: string;
}

interface TierPriceRow {
  product_id: string;
  pricing_tier_id: string;
  price: number;
  shipping_cost: number;
}

interface ProductBaseRow {
  id: string;
  price: number;
  shipping_cost: number;
}

/**
 * Look up the caller's active pricing tier row. Nullable — a user with
 * no assignment is treated as Tier 1 downstream by the resolver.
 */
export async function getUserPricingTier(userId: string | null | undefined): Promise<TierRow | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("coffee_pricing_tier_id, coffee_pricing_tier:coffee_pricing_tier_id(id, tier_key, name, is_active)")
    .eq("id", userId)
    .maybeSingle();
  const tier = (data?.coffee_pricing_tier as unknown as (TierRow & { is_active: boolean }) | null) || null;
  if (!tier || tier.is_active === false) return null;
  return { id: tier.id, tier_key: tier.tier_key, name: tier.name };
}

/**
 * Fetch the active Tier 1 row so the resolver can fall back when a
 * caller either has no assigned tier or is missing a price for their
 * assigned tier.
 */
export async function getTierOneRow(): Promise<TierRow | null> {
  const { data } = await supabaseAdmin
    .from("coffee_pricing_tiers")
    .select("id, tier_key, name")
    .eq("tier_key", "tier_1")
    .eq("is_active", true)
    .maybeSingle();
  return (data as TierRow) || null;
}

/**
 * Batch pricing resolver — hydrate a map of {product_id → ResolvedPricing}
 * for the given user in a fixed number of queries regardless of list
 * length. Use this from every list surface (products endpoint, cart,
 * checkout, admin previews, receipts).
 */
export async function resolveCoffeeProductsPricing(args: {
  productIds: string[];
  userId?: string | null;
}): Promise<Map<string, ResolvedPricing>> {
  const out = new Map<string, ResolvedPricing>();
  const productIds = Array.from(new Set(args.productIds.filter(Boolean)));
  if (productIds.length === 0) return out;

  const [userTier, tierOne, productBaseResp, tierPriceResp] = await Promise.all([
    getUserPricingTier(args.userId ?? null),
    getTierOneRow(),
    supabaseAdmin
      .from("coffee_products")
      .select("id, price, shipping_cost")
      .in("id", productIds),
    supabaseAdmin
      .from("coffee_product_tier_prices")
      .select("product_id, pricing_tier_id, price, shipping_cost")
      .in("product_id", productIds)
      .eq("is_active", true),
  ]);

  const effectiveTier = userTier || tierOne;
  const bases = new Map<string, ProductBaseRow>(
    ((productBaseResp.data || []) as ProductBaseRow[]).map((p) => [p.id, p]),
  );
  const tierPrices = new Map<string, TierPriceRow>();
  for (const row of (tierPriceResp.data || []) as TierPriceRow[]) {
    tierPrices.set(`${row.product_id}:${row.pricing_tier_id}`, row);
  }

  for (const pid of productIds) {
    const base = bases.get(pid);
    if (!base) {
      // Product row missing — shouldn't happen, but never throw here;
      // callers include invalid ids sometimes (deleted while cart open).
      out.set(pid, {
        product_id: pid,
        pricing_tier_id: null,
        tier_key: null,
        tier_name: null,
        price: 0,
        shipping_cost: 0,
        currency: "USD",
        fallback_used: true,
        fallback_reason: "product-not-found",
      });
      continue;
    }

    // Preferred: the user's tier price
    if (effectiveTier) {
      const priced = tierPrices.get(`${pid}:${effectiveTier.id}`);
      if (priced) {
        const isFallback = !!(userTier && effectiveTier.tier_key === "tier_1" && !args.userId);
        out.set(pid, {
          product_id: pid,
          pricing_tier_id: effectiveTier.id,
          tier_key: effectiveTier.tier_key,
          tier_name: effectiveTier.name,
          price: Number(priced.price),
          shipping_cost: Number(priced.shipping_cost),
          currency: "USD",
          fallback_used: !userTier,
          fallback_reason: !userTier ? "no-tier-assigned-defaulted-tier-1" : null,
        });
        continue;
      }
    }

    // Fallback 1: Tier 1 price if user tier had no row
    if (tierOne) {
      const t1 = tierPrices.get(`${pid}:${tierOne.id}`);
      if (t1) {
        out.set(pid, {
          product_id: pid,
          pricing_tier_id: tierOne.id,
          tier_key: tierOne.tier_key,
          tier_name: tierOne.name,
          price: Number(t1.price),
          shipping_cost: Number(t1.shipping_cost),
          currency: "USD",
          fallback_used: true,
          fallback_reason: userTier
            ? `no-price-for-${userTier.tier_key}-fell-back-tier-1`
            : "no-tier-assigned-defaulted-tier-1",
        });
        continue;
      }
    }

    // Fallback 2: bootstrap product.price
    out.set(pid, {
      product_id: pid,
      pricing_tier_id: null,
      tier_key: null,
      tier_name: null,
      price: Number(base.price),
      shipping_cost: Number(base.shipping_cost || 0),
      currency: "USD",
      fallback_used: true,
      fallback_reason: "no-tier-prices-defined-using-product-base",
    });
  }

  return out;
}

/**
 * Single-product convenience wrapper. Prefer resolveCoffeeProductsPricing
 * when you have more than one product in hand.
 */
export async function resolveCoffeeProductPricing(args: {
  productId: string;
  userId?: string | null;
}): Promise<ResolvedPricing> {
  const map = await resolveCoffeeProductsPricing({ productIds: [args.productId], userId: args.userId });
  const hit = map.get(args.productId);
  if (hit) return hit;
  return {
    product_id: args.productId,
    pricing_tier_id: null,
    tier_key: null,
    tier_name: null,
    price: 0,
    shipping_cost: 0,
    currency: "USD",
    fallback_used: true,
    fallback_reason: "product-not-found",
  };
}
