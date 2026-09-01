import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";
import { recordAuditEvent } from "@/lib/storefront/audit";

/**
 * Owner CRUD for per-customer price overrides (layer #2 in
 * precedence). Owners can only manage rows for customers that
 * belong to their tenant — the WHERE tenant_id=tenant.id clause
 * enforces that.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const customerId = req.nextUrl.searchParams.get("customer_id");
  let q = supabaseAdmin
    .from("storefront_customer_prices")
    .select("*")
    .eq("tenant_id", tenant.id);
  if (customerId) q = q.eq("customer_profile_id", customerId);
  const { data } = await q.order("updated_at", { ascending: false });
  return NextResponse.json({ prices: data ?? [] });
}

interface UpsertBody {
  customer_profile_id: string;
  entries: Array<{ product_id: string; customer_price: number; active?: boolean }>;
  source?: "manual" | "invitation" | "proposal" | "admin_override";
  source_ref_id?: string | null;
}

export async function PUT(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as UpsertBody | null;
  if (
    !body ||
    !body.customer_profile_id ||
    !Array.isArray(body.entries) ||
    body.entries.length === 0
  ) {
    return NextResponse.json({ error: "customer_profile_id + entries[] required" }, { status: 400 });
  }

  // Confirm the customer actually belongs to this tenant. The
  // permanent-link column blocks admin-transferred fits, so this is
  // the enforcement point for owner-scoped writes.
  const { data: customerRow } = await supabaseAdmin
    .from("profiles")
    .select("id, storefront_tenant_id")
    .eq("id", body.customer_profile_id)
    .maybeSingle();
  if (!customerRow || (customerRow as { storefront_tenant_id: string | null }).storefront_tenant_id !== tenant.id) {
    return NextResponse.json({ error: "Customer is not enrolled with this tenant" }, { status: 403 });
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
      customer_profile_id: body.customer_profile_id,
      product_id: e.product_id,
      customer_price: e.customer_price,
      active: e.active !== false,
      source: body.source ?? "manual",
      source_ref_id: body.source_ref_id ?? null,
      updated_by: userId,
    }));
  if (rows.length === 0) {
    return NextResponse.json({ error: "no valid entries" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("storefront_customer_prices")
    .upsert(rows, { onConflict: "customer_profile_id,product_id" })
    .select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAuditEvent({
    tenantId: tenant.id,
    actorId: userId,
    actorRole: "operator",
    action: "pricing.customer_updated",
    entityType: "storefront_customer_prices",
    entityId: body.customer_profile_id,
    after: { rows: rows.length },
  });
  return NextResponse.json({ prices: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });
  const customerId = req.nextUrl.searchParams.get("customer_id");
  const productId = req.nextUrl.searchParams.get("product_id");
  if (!customerId || !productId) {
    return NextResponse.json({ error: "customer_id + product_id required" }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from("storefront_customer_prices")
    .delete()
    .eq("tenant_id", tenant.id)
    .eq("customer_profile_id", customerId)
    .eq("product_id", productId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await recordAuditEvent({
    tenantId: tenant.id,
    actorId: userId,
    actorRole: "operator",
    action: "pricing.customer_deleted",
    entityType: "storefront_customer_prices",
    entityId: customerId,
    after: { product_id: productId },
  });
  return NextResponse.json({ ok: true });
}
