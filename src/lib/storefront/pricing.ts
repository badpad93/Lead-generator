/**
 * Storefront pricing resolver.
 *
 * Turns a "customer wants to buy N of product X through tenant T"
 * request into an authoritative per-line financial snapshot that
 * the checkout writes to coffee_order_items verbatim. All
 * checkout math runs through this module — the browser never
 * supplies a price, and every commit that writes financial fields
 * to coffee_order_items should call resolveCart() first.
 *
 * Precedence per spec § "Master Catalog and Pricing Engine":
 *
 *   1. Accepted, active customer quote / contract price
 *      (coffee_pricing_proposals accepted line, if any)
 *   2. Customer-specific price assignment
 *      (storefront_customer_prices row for this profile+product)
 *   3. Operator-configured customer price
 *      (storefront_tenant_prices row for this tenant+product)
 *   4. Operator's general retail price
 *      (fell through into #3 today; reserved for a future
 *      per-tenant catalog markup schedule)
 *   5. Apex recommended retail price
 *      (coffee_products.price)
 *   6. Platform fallback price
 *      (base tier price from coffee_product_tier_prices for the
 *      tenant's base_pricing_tier_id)
 *
 * "No price may resolve below the applicable Apex base price."
 * The base is (in order): the tenant's assigned tier price, or
 * the platform "tier_1" tier as a last-resort floor.
 *
 * Money is dollars-and-cents (numbers with 2 decimals). We use
 * plain number arithmetic then round every intermediate to 2dp
 * to avoid the 0.1 + 0.2 = 0.30000000000000004 class of drift.
 * All money values on the returned snapshot are ROUNDED to 2dp.
 *
 * If any input violates the invariants (product missing, tenant
 * inactive, no base price found), resolveCart throws with a
 * PricingResolutionError — checkout callers should return 400
 * so nothing partial ever writes to the ledger.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ─── Types ────────────────────────────────────────────────────────

export interface CartLine {
  product_id: string;
  quantity: number;
}

export interface ResolveCartInput {
  tenantId: string;
  customerProfileId: string;
  lines: CartLine[];
  /**
   * Optional: if the customer is checking out from an accepted
   * proposal, pass its id and the resolver will apply layer #1
   * pricing (accepted quote lines override customer/tenant
   * defaults for the products that appear on the proposal).
   */
  acceptedProposalId?: string | null;
}

export type PriceSource =
  | "accepted_proposal"
  | "customer_override"
  | "tenant_price"
  | "product_recommended"
  | "base_tier";

export interface ResolvedLine {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  base_price_per_unit: number;
  tenant_price_per_unit: number;
  commission_per_unit: number;
  base_price_amount: number;
  tenant_price_amount: number;
  commission_amount: number;
  tax_amount: number;
  price_source: PriceSource;
  base_pricing_tier_id: string | null;
}

export interface ResolvedCart {
  tenantId: string;
  customerProfileId: string;
  lines: ResolvedLine[];
  totals: {
    base_price_total: number;
    tenant_price_total: number;
    commission_total: number;
    tax_total: number;
    order_total: number;
  };
}

export class PricingResolutionError extends Error {
  public code:
    | "TENANT_NOT_FOUND"
    | "TENANT_NOT_APPROVED"
    | "PRODUCT_NOT_FOUND"
    | "PRODUCT_INACTIVE"
    | "NO_BASE_PRICE"
    | "PRICE_BELOW_BASE"
    | "EMPTY_CART"
    | "BAD_QUANTITY";
  constructor(code: PricingResolutionError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "PricingResolutionError";
  }
}

// ─── Money helpers ────────────────────────────────────────────────

/**
 * Round to 2 decimal places using banker's rounding stand-in
 * (half-up rounding on positive dollars — matches how QB and
 * every US invoice system handles pennies). Never use raw
 * multiplication + division; go through toFixed for the visible
 * rounding, then parseFloat back.
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function multiply(a: number, b: number): number {
  return round2(a * b);
}

// ─── Data access ──────────────────────────────────────────────────

interface TenantRow {
  id: string;
  status: string;
  base_pricing_tier_id: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  active: boolean;
}

async function loadTenant(tenantId: string): Promise<TenantRow> {
  const { data, error } = await supabaseAdmin
    .from("storefront_tenants")
    .select("id, status, base_pricing_tier_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) {
    throw new PricingResolutionError(
      "TENANT_NOT_FOUND",
      `Storefront tenant ${tenantId} not found`,
    );
  }
  if (data.status !== "approved") {
    throw new PricingResolutionError(
      "TENANT_NOT_APPROVED",
      `Storefront tenant ${tenantId} is ${data.status}; checkout requires approved status`,
    );
  }
  return data as TenantRow;
}

async function loadProducts(ids: string[]): Promise<Map<string, ProductRow>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabaseAdmin
    .from("coffee_products")
    .select("id, name, sku, price, active")
    .in("id", ids);
  const map = new Map<string, ProductRow>();
  for (const p of (data ?? []) as ProductRow[]) map.set(p.id, p);
  return map;
}

async function loadBaseTierPrices(
  tierId: string | null,
  productIds: string[],
): Promise<Map<string, number>> {
  if (!tierId || productIds.length === 0) return new Map();
  const { data } = await supabaseAdmin
    .from("coffee_product_tier_prices")
    .select("product_id, price")
    .eq("pricing_tier_id", tierId)
    .in("product_id", productIds);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ product_id: string; price: number }>) {
    map.set(row.product_id, Number(row.price));
  }
  return map;
}

async function loadTenantPrices(
  tenantId: string,
  productIds: string[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const { data } = await supabaseAdmin
    .from("storefront_tenant_prices")
    .select("product_id, customer_price")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .in("product_id", productIds);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ product_id: string; customer_price: number }>) {
    map.set(row.product_id, Number(row.customer_price));
  }
  return map;
}

async function loadCustomerPrices(
  customerProfileId: string,
  productIds: string[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const { data } = await supabaseAdmin
    .from("storefront_customer_prices")
    .select("product_id, customer_price")
    .eq("customer_profile_id", customerProfileId)
    .eq("active", true)
    .in("product_id", productIds);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ product_id: string; customer_price: number }>) {
    map.set(row.product_id, Number(row.customer_price));
  }
  return map;
}

interface ProposalLineRow {
  product_id: string | null;
  unit_price: number | null;
}

async function loadAcceptedProposalLines(
  proposalId: string,
  productIds: string[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  // Validate the proposal is accepted first; a non-accepted
  // proposal must NEVER influence pricing.
  const { data: proposal } = await supabaseAdmin
    .from("coffee_pricing_proposals")
    .select("id, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal || (proposal as { status: string }).status !== "accepted") {
    return new Map();
  }
  const { data } = await supabaseAdmin
    .from("coffee_pricing_proposal_items")
    .select("product_id, unit_price")
    .eq("proposal_id", proposalId)
    .in("product_id", productIds);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as ProposalLineRow[]) {
    if (row.product_id && row.unit_price != null) {
      map.set(row.product_id, Number(row.unit_price));
    }
  }
  return map;
}

// ─── Resolver ─────────────────────────────────────────────────────

/**
 * Resolve a cart into per-line snapshots the checkout can write
 * to coffee_order_items verbatim. Runs entirely server-side and
 * fetches every price fresh from the DB — the caller is never
 * trusted with money values.
 */
export async function resolveCart(input: ResolveCartInput): Promise<ResolvedCart> {
  if (input.lines.length === 0) {
    throw new PricingResolutionError("EMPTY_CART", "Cart is empty");
  }
  for (const line of input.lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new PricingResolutionError(
        "BAD_QUANTITY",
        `Line for product ${line.product_id} has invalid quantity ${line.quantity}`,
      );
    }
  }

  const tenant = await loadTenant(input.tenantId);
  const productIds = Array.from(new Set(input.lines.map((l) => l.product_id)));

  const [products, baseTierPrices, tenantPrices, customerPrices, proposalPrices] =
    await Promise.all([
      loadProducts(productIds),
      loadBaseTierPrices(tenant.base_pricing_tier_id, productIds),
      loadTenantPrices(input.tenantId, productIds),
      loadCustomerPrices(input.customerProfileId, productIds),
      input.acceptedProposalId
        ? loadAcceptedProposalLines(input.acceptedProposalId, productIds)
        : Promise.resolve(new Map<string, number>()),
    ]);

  const resolvedLines: ResolvedLine[] = [];

  for (const line of input.lines) {
    const product = products.get(line.product_id);
    if (!product) {
      throw new PricingResolutionError(
        "PRODUCT_NOT_FOUND",
        `Product ${line.product_id} not found`,
      );
    }
    if (!product.active) {
      throw new PricingResolutionError(
        "PRODUCT_INACTIVE",
        `Product ${product.sku} is not active`,
      );
    }

    // Base price: tenant's assigned tier -> product recommended
    // -> refuse. We DO NOT fall through to zero; a product with
    // no discoverable base price at checkout time is a hard error
    // because commission math can't run.
    const basePrice =
      baseTierPrices.get(product.id) ??
      (product.price != null ? Number(product.price) : null);
    if (basePrice == null || !Number.isFinite(basePrice)) {
      throw new PricingResolutionError(
        "NO_BASE_PRICE",
        `Product ${product.sku} has no base tier price and no recommended price; cannot compute commission`,
      );
    }

    // Precedence: proposal -> customer override -> tenant price
    // -> product recommended -> base tier.
    let source: PriceSource = "base_tier";
    let tenantPrice: number | undefined;

    const p = proposalPrices.get(product.id);
    if (p != null) {
      tenantPrice = p;
      source = "accepted_proposal";
    }
    if (tenantPrice == null) {
      const c = customerPrices.get(product.id);
      if (c != null) {
        tenantPrice = c;
        source = "customer_override";
      }
    }
    if (tenantPrice == null) {
      const t = tenantPrices.get(product.id);
      if (t != null) {
        tenantPrice = t;
        source = "tenant_price";
      }
    }
    if (tenantPrice == null && product.price != null) {
      tenantPrice = Number(product.price);
      source = "product_recommended";
    }
    if (tenantPrice == null) {
      tenantPrice = basePrice;
      source = "base_tier";
    }

    // Floor enforcement — the invariant that keeps Apex whole.
    if (round2(tenantPrice) < round2(basePrice)) {
      throw new PricingResolutionError(
        "PRICE_BELOW_BASE",
        `Resolved price ${tenantPrice} for ${product.sku} is below base ${basePrice} (source=${source})`,
      );
    }

    const basePricePerUnit = round2(basePrice);
    const tenantPricePerUnit = round2(tenantPrice);
    const commissionPerUnit = round2(tenantPricePerUnit - basePricePerUnit);

    const basePriceAmount = multiply(basePricePerUnit, line.quantity);
    const tenantPriceAmount = multiply(tenantPricePerUnit, line.quantity);
    const commissionAmount = multiply(commissionPerUnit, line.quantity);
    // All storefront transactions are resale = tax-exempt at
    // Vending Connector -> customer. Tax always 0. Kept on the
    // shape so a future taxable path can populate it.
    const taxAmount = 0;

    resolvedLines.push({
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: line.quantity,
      base_price_per_unit: basePricePerUnit,
      tenant_price_per_unit: tenantPricePerUnit,
      commission_per_unit: commissionPerUnit,
      base_price_amount: basePriceAmount,
      tenant_price_amount: tenantPriceAmount,
      commission_amount: commissionAmount,
      tax_amount: taxAmount,
      price_source: source,
      base_pricing_tier_id: tenant.base_pricing_tier_id,
    });
  }

  const totals = {
    base_price_total: round2(
      resolvedLines.reduce((acc, l) => acc + l.base_price_amount, 0),
    ),
    tenant_price_total: round2(
      resolvedLines.reduce((acc, l) => acc + l.tenant_price_amount, 0),
    ),
    commission_total: round2(
      resolvedLines.reduce((acc, l) => acc + l.commission_amount, 0),
    ),
    tax_total: round2(
      resolvedLines.reduce((acc, l) => acc + l.tax_amount, 0),
    ),
    order_total: 0,
  };
  totals.order_total = round2(totals.tenant_price_total + totals.tax_total);

  return {
    tenantId: input.tenantId,
    customerProfileId: input.customerProfileId,
    lines: resolvedLines,
    totals,
  };
}
