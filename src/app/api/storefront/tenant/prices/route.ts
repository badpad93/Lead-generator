import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";
import { recordAuditEvent } from "@/lib/storefront/audit";

/**
 * Owner CRUD for storefront_tenant_prices (layer #3 in the pricing
 * precedence: the tenant-wide customer-facing price for a product).
 *
 * The DB CHECK on customer_price >= 0 and the checkout resolver's
 * floor enforcement (tenant_price >= base tier price) both still
 * apply — an INSERT below the base still succeeds at write time
 * but the resolver refuses it at checkout, keeping bad prices from
 * causing lost commission.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });
  const { data } = await supabaseAdmin
    .from("storefront_tenant_prices")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("updated_at", { ascending: false });

  // TRUE per-product base (the owner's cost): the tenant's assigned
  // tier price, falling back to the product list price — the same
  // precedence the checkout resolver's commission floor uses. The
  // pricing page previously showed bare list price as "Base", so
  // owners couldn't see their real cost or their real margin.
  const basePrices: Record<string, number> = {};
  const { data: products } = await supabaseAdmin
    .from("coffee_products")
    .select("id, price")
    .eq("active", true);
  for (const p of (products ?? []) as Array<{ id: string; price: number | null }>) {
    if (p.price != null) basePrices[p.id] = Number(p.price);
  }
  if (tenant.base_pricing_tier_id) {
    const { data: tierRows } = await supabaseAdmin
      .from("coffee_product_tier_prices")
      .select("product_id, price")
      .eq("pricing_tier_id", tenant.base_pricing_tier_id)
      .eq("is_active", true);
    for (const row of (tierRows ?? []) as Array<{ product_id: string; price: number }>) {
      basePrices[row.product_id] = Number(row.price);
    }
  }

  return NextResponse.json({ prices: data ?? [], base_prices: basePrices });
}

interface UpsertBody {
  entries: Array<{ product_id: string; customer_price: number; active?: boolean }>;
}

export async function PUT(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as UpsertBody | null;
  if (!body || !Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: "entries[] required" }, { status: 400 });
  }
  const rows = body.entries
    .filter(
      (e) =>
        typeof e.product_id === "string" &&
        typeof e.customer_price === "number" &&
        e.customer_price >= 0,
    )
    .map((e) => ({
      tenant_id: tenant.id,
      product_id: e.product_id,
      customer_price: e.customer_price,
      active: e.active !== false,
      updated_by: userId,
    }));
  if (rows.length === 0) {
    return NextResponse.json({ error: "no valid entries" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("storefront_tenant_prices")
    .upsert(rows, { onConflict: "tenant_id,product_id" })
    .select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAuditEvent({
    tenantId: tenant.id,
    actorId: userId,
    actorRole: "operator",
    action: "pricing.tenant_updated",
    entityType: "storefront_tenant_prices",
    after: { rows: rows.length },
  });
  return NextResponse.json({ prices: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });
  const productId = req.nextUrl.searchParams.get("product_id");
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });
  const { error } = await supabaseAdmin
    .from("storefront_tenant_prices")
    .delete()
    .eq("tenant_id", tenant.id)
    .eq("product_id", productId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await recordAuditEvent({
    tenantId: tenant.id,
    actorId: userId,
    actorRole: "operator",
    action: "pricing.tenant_deleted",
    entityType: "storefront_tenant_prices",
    after: { product_id: productId },
  });
  return NextResponse.json({ ok: true });
}
