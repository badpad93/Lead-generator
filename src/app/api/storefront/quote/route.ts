import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveCoffeeProductsPricing, round2 } from "@/lib/coffeePricing";
import { isStorefrontFlagEnabled } from "@/lib/storefront/flags";

/**
 * Preview pricing for an enrolled customer's cart — a THIN wrapper
 * over the unified coffee pricing resolver's storefront overlay, the
 * same code path /api/coffee/checkout charges through. No order is
 * written. Kept as its own endpoint purely so the storefront shop can
 * show a live total; every number comes from the shared resolver so
 * the preview can never drift from what checkout bills.
 *
 * POST { tenant_id, cart: [{product_id, quantity}] }
 *   -> { quote: { lines, totals } }
 *   -> 400 { error, code } for pricing-resolution problems
 *      (NO_BASE_PRICE etc. — the client maps codes to friendly copy)
 *
 * Requires an authenticated session enrolled with this tenant — same
 * permanent-link rule as checkout, so another tenant's customer can't
 * enumerate per-customer pricing.
 */
interface QuoteBody {
  tenant_id: string;
  cart: Array<{ product_id: string; quantity: number }>;
  accepted_proposal_id?: string | null;
}

export async function POST(req: NextRequest) {
  if (!(await isStorefrontFlagEnabled("storefront.checkout_enabled"))) {
    return NextResponse.json(
      { error: "Storefront checkout is temporarily unavailable" },
      { status: 503 },
    );
  }
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as QuoteBody | null;
  if (!body?.tenant_id || !Array.isArray(body.cart) || body.cart.length === 0) {
    return NextResponse.json({ error: "tenant_id + cart[] required" }, { status: 400 });
  }

  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("id, storefront_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const profile = profileRow as { storefront_tenant_id: string | null } | null;
  if (!profile || profile.storefront_tenant_id !== body.tenant_id) {
    return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
  }

  const lines = body.cart
    .map((l) => ({ product_id: String(l.product_id), quantity: Number(l.quantity) }))
    .filter((l) => l.product_id && Number.isFinite(l.quantity) && l.quantity > 0);
  if (lines.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }
  const productIds = Array.from(new Set(lines.map((l) => l.product_id)));

  // Owner-hidden products don't exist for this storefront — refuse
  // them the same way a deleted product is refused so the cart UI
  // prompts removal.
  const { getHiddenProductIds } = await import("@/lib/storefront/visibility");
  const hidden = await getHiddenProductIds(body.tenant_id);
  if (productIds.some((id) => hidden.has(id))) {
    return NextResponse.json(
      { error: "An item in your cart is no longer available in this storefront", code: "PRODUCT_NOT_FOUND" },
      { status: 400 },
    );
  }

  const [priced, productsResp] = await Promise.all([
    resolveCoffeeProductsPricing({
      productIds,
      userId,
      storefront: {
        tenantId: body.tenant_id,
        customerProfileId: userId,
        acceptedProposalId: body.accepted_proposal_id ?? null,
      },
    }),
    supabaseAdmin.from("coffee_products").select("id, name, sku, active").in("id", productIds),
  ]);
  const products = new Map(
    ((productsResp.data ?? []) as Array<{ id: string; name: string; sku: string; active: boolean }>).map(
      (p) => [p.id, p],
    ),
  );

  const quoteLines = [];
  for (const line of lines) {
    const product = products.get(line.product_id);
    if (!product) {
      return NextResponse.json(
        { error: "An item in your cart no longer exists", code: "PRODUCT_NOT_FOUND" },
        { status: 400 },
      );
    }
    if (!product.active) {
      return NextResponse.json(
        { error: `${product.name} is no longer available`, code: "PRODUCT_INACTIVE" },
        { status: 400 },
      );
    }
    const entry = priced.get(line.product_id);
    const err = entry?.storefront?.error;
    if (!entry || err) {
      return NextResponse.json(
        {
          error:
            err === "PRICE_BELOW_BASE"
              ? "A configured price is below the storefront's base price"
              : "This storefront's pricing isn't set up for an item in your cart",
          code: err ?? "NO_BASE_PRICE",
        },
        { status: 400 },
      );
    }
    quoteLines.push({
      product_id: line.product_id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: line.quantity,
      tenant_price_per_unit: entry.price,
      tenant_price_amount: round2(entry.price * line.quantity),
    });
  }

  const tenantPriceTotal = round2(quoteLines.reduce((a, l) => a + l.tenant_price_amount, 0));
  return NextResponse.json({
    quote: {
      lines: quoteLines,
      totals: { tenant_price_total: tenantPriceTotal, order_total: tenantPriceTotal },
    },
  });
}
