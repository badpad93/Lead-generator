import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveCart, PricingResolutionError } from "@/lib/storefront/pricing";
import { isStorefrontFlagEnabled } from "@/lib/storefront/flags";

/**
 * Preview pricing for an enrolled customer's cart — same resolver
 * the checkout uses, but no order is written. The customer-facing
 * storefront page calls this to show a running total while the
 * user shops. Prices are ALWAYS resolved server-side.
 *
 * POST { tenant_id, cart: [{product_id, quantity}] } -> ResolvedCart
 *
 * Requires an authenticated customer session AND that the profile
 * is enrolled with this tenant — same permanent-link rule as
 * checkout so an enumeration attempt from another tenant's customer
 * can't leak per-customer pricing.
 */
interface QuoteBody {
  tenant_id: string;
  cart: Array<{ product_id: string; quantity: number }>;
  accepted_proposal_id?: string | null;
}

export async function POST(req: NextRequest) {
  // Gated on the checkout flag, not a separate one — pricing a
  // cart the customer can't buy is a worse UX than not showing
  // prices at all. Same 503 shape as /api/storefront/checkout.
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

  try {
    const resolved = await resolveCart({
      tenantId: body.tenant_id,
      customerProfileId: userId,
      lines: body.cart.map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity),
      })),
      acceptedProposalId: body.accepted_proposal_id ?? null,
    });
    return NextResponse.json({ quote: resolved });
  } catch (err) {
    if (err instanceof PricingResolutionError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("[storefront/quote] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
