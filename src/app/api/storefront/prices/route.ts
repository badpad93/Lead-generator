import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveCoffeeProductsPricing } from "@/lib/coffeePricing";
import { getHiddenProductIds } from "@/lib/storefront/visibility";
import { isStorefrontFlagEnabled } from "@/lib/storefront/flags";

/**
 * The enrolled customer's full price list for a storefront — every
 * visible product priced up front, so the catalog shows a price on
 * every card the moment the page loads. Previously prices only
 * appeared through the cart quote, which meant a shopper saw "—" on
 * everything until they added an item.
 *
 * Same resolver, same enrollment rule as /api/storefront/quote, so
 * the browsing price can never differ from the checkout price.
 *
 * POST { tenant_id, product_ids?: string[] }
 *   -> { prices: { [product_id]: number } }
 * Products whose pricing can't resolve (or that the owner hid) are
 * simply absent — the card renders its no-price state.
 */
interface PricesBody {
  tenant_id: string;
  product_ids?: string[];
}

export async function POST(req: NextRequest) {
  if (!(await isStorefrontFlagEnabled("storefront.checkout_enabled"))) {
    return NextResponse.json(
      { error: "Storefront pricing is temporarily unavailable" },
      { status: 503 },
    );
  }
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PricesBody | null;
  if (!body?.tenant_id) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
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

  // Requested ids, or the whole active catalog when none are given.
  let productIds = Array.from(
    new Set((body.product_ids ?? []).filter((id) => typeof id === "string" && id)),
  );
  if (productIds.length === 0) {
    const { data } = await supabaseAdmin
      .from("coffee_products")
      .select("id")
      .eq("active", true);
    productIds = ((data ?? []) as Array<{ id: string }>).map((p) => p.id);
  }
  if (productIds.length === 0) return NextResponse.json({ prices: {} });

  const hidden = await getHiddenProductIds(body.tenant_id);
  const visibleIds = productIds.filter((id) => !hidden.has(id));
  if (visibleIds.length === 0) return NextResponse.json({ prices: {} });

  const priced = await resolveCoffeeProductsPricing({
    productIds: visibleIds,
    userId,
    storefront: { tenantId: body.tenant_id, customerProfileId: userId },
  });

  const prices: Record<string, number> = {};
  for (const id of visibleIds) {
    const entry = priced.get(id);
    if (entry && !entry.storefront?.error) prices[id] = entry.price;
  }
  return NextResponse.json({ prices });
}
