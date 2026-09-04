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

/**
 * Round money to 2dp. Shared by the storefront overlay, the
 * commission ledger, and the QB line builders — one rounding rule
 * everywhere so ledger math always reconciles with invoice math.
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type StorefrontPriceSource =
  | "accepted_proposal"
  | "customer_override"
  | "tenant_price"
  | "product_recommended"
  | "base_tier";

/**
 * Per-line storefront pricing snapshot, present only when the
 * resolver ran with a StorefrontContext. `error` is set instead of
 * throwing so list surfaces can still render; checkout callers MUST
 * refuse any line with a non-null error.
 *
 *   NO_BASE_PRICE    — no tenant tier price and no product list
 *                      price; commission math cannot run.
 *   PRICE_BELOW_BASE — resolved sell price undercuts the base;
 *                      "no price may resolve below the applicable
 *                      Apex base price".
 */
export interface StorefrontPricing {
  base_price: number;
  commission: number;
  price_source: StorefrontPriceSource;
  base_pricing_tier_id: string | null;
  error: "NO_BASE_PRICE" | "PRICE_BELOW_BASE" | null;
}

/**
 * Buyer-is-an-enrolled-storefront-customer context. When passed,
 * the operator-tier result is REPLACED by the storefront precedence
 * chain (accepted proposal → per-customer override → tenant price →
 * product list price → tenant base-tier price) and each entry gains
 * a `storefront` snapshot with base price + commission. Storefront
 * orders ship free (parity with the retired storefront checkout),
 * so shipping_cost is forced to 0.
 */
export interface StorefrontContext {
  tenantId: string;
  customerProfileId: string;
  acceptedProposalId?: string | null;
}

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
  storefront?: StorefrontPricing;
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
  storefront?: StorefrontContext | null;
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

  if (args.storefront) {
    await applyStorefrontOverlay(out, productIds, bases, args.storefront);
  }

  return out;
}

/**
 * Storefront overlay — replaces the operator-tier resolution with
 * the storefront precedence chain for enrolled-customer buyers.
 * See StorefrontContext. Mutates `out` in place; never throws for a
 * pricing problem (the per-entry storefront.error carries it).
 */
async function applyStorefrontOverlay(
  out: Map<string, ResolvedPricing>,
  productIds: string[],
  bases: Map<string, ProductBaseRow>,
  ctx: StorefrontContext,
): Promise<void> {
  const [tenantResp, tenantPriceResp, customerPriceResp, proposalPrices] = await Promise.all([
    supabaseAdmin
      .from("storefront_tenants")
      .select("id, base_pricing_tier_id")
      .eq("id", ctx.tenantId)
      .maybeSingle(),
    supabaseAdmin
      .from("storefront_tenant_prices")
      .select("product_id, customer_price")
      .eq("tenant_id", ctx.tenantId)
      .eq("active", true)
      .in("product_id", productIds),
    supabaseAdmin
      .from("storefront_customer_prices")
      .select("product_id, customer_price")
      .eq("customer_profile_id", ctx.customerProfileId)
      .eq("active", true)
      .in("product_id", productIds),
    loadAcceptedProposalPrices(ctx.acceptedProposalId ?? null, productIds),
  ]);

  const baseTierId =
    (tenantResp.data as { base_pricing_tier_id: string | null } | null)?.base_pricing_tier_id ??
    null;
  const baseTierPrices = new Map<string, number>();
  if (baseTierId) {
    const { data } = await supabaseAdmin
      .from("coffee_product_tier_prices")
      .select("product_id, price")
      .eq("pricing_tier_id", baseTierId)
      .eq("is_active", true)
      .in("product_id", productIds);
    for (const row of (data ?? []) as Array<{ product_id: string; price: number }>) {
      baseTierPrices.set(row.product_id, Number(row.price));
    }
  }
  const toPriceMap = (rows: unknown): Map<string, number> => {
    const m = new Map<string, number>();
    for (const row of (rows ?? []) as Array<{ product_id: string; customer_price: number }>) {
      m.set(row.product_id, Number(row.customer_price));
    }
    return m;
  };
  const tenantPrices = toPriceMap(tenantPriceResp.data);
  const customerPrices = toPriceMap(customerPriceResp.data);

  for (const pid of productIds) {
    const entry = out.get(pid);
    if (!entry) continue;
    const baseRow = bases.get(pid);
    const recommended = baseRow && baseRow.price != null ? Number(baseRow.price) : null;
    const tierBase = baseTierPrices.get(pid) ?? null;
    // Commission base: tenant's assigned tier price, else list price.
    const basePrice = tierBase ?? recommended;

    // Sell price precedence — identical to the retired storefront
    // resolver: proposal → customer override → tenant price →
    // product list → tenant base tier.
    let source: StorefrontPriceSource = "base_tier";
    let sell: number | null = null;
    const fromProposal = proposalPrices.get(pid);
    if (fromProposal != null) {
      sell = fromProposal;
      source = "accepted_proposal";
    }
    if (sell == null && customerPrices.has(pid)) {
      sell = customerPrices.get(pid)!;
      source = "customer_override";
    }
    if (sell == null && tenantPrices.has(pid)) {
      sell = tenantPrices.get(pid)!;
      source = "tenant_price";
    }
    if (sell == null && recommended != null) {
      sell = recommended;
      source = "product_recommended";
    }
    if (sell == null && tierBase != null) {
      sell = tierBase;
      source = "base_tier";
    }

    let error: StorefrontPricing["error"] = null;
    if (basePrice == null || sell == null) error = "NO_BASE_PRICE";
    else if (round2(sell) < round2(basePrice)) error = "PRICE_BELOW_BASE";

    const finalSell = round2(sell ?? 0);
    const finalBase = round2(basePrice ?? 0);
    out.set(pid, {
      ...entry,
      price: finalSell,
      shipping_cost: 0,
      pricing_tier_id: baseTierId,
      tier_key: null,
      tier_name: null,
      fallback_used: error != null,
      fallback_reason: error,
      storefront: {
        base_price: finalBase,
        commission: round2(finalSell - finalBase),
        price_source: source,
        base_pricing_tier_id: baseTierId,
        error,
      },
    });
  }
}

/**
 * Accepted-proposal line prices. A proposal in any state other than
 * "accepted" must NEVER influence pricing — returns an empty map.
 */
async function loadAcceptedProposalPrices(
  proposalId: string | null,
  productIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!proposalId || productIds.length === 0) return map;
  const { data: proposal } = await supabaseAdmin
    .from("coffee_pricing_proposals")
    .select("id, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal || (proposal as { status: string }).status !== "accepted") return map;
  const { data } = await supabaseAdmin
    .from("coffee_pricing_proposal_items")
    .select("product_id, unit_price")
    .eq("proposal_id", proposalId)
    .in("product_id", productIds);
  for (const row of (data ?? []) as Array<{ product_id: string | null; unit_price: number | null }>) {
    if (row.product_id && row.unit_price != null) map.set(row.product_id, Number(row.unit_price));
  }
  return map;
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
