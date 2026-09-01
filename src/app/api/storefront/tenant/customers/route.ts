import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";

/**
 * Owner: list every customer enrolled with this tenant, plus a
 * lightweight order + spend rollup so the operator can eyeball
 * activity without a separate reporting page.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, full_name, email, phone, city, state, storefront_enrolled_at, storefront_enrollment_source",
    )
    .eq("storefront_tenant_id", tenant.id)
    .order("storefront_enrolled_at", { ascending: false });
  const customers = (profiles ?? []) as Array<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    city: string | null;
    state: string | null;
    storefront_enrolled_at: string | null;
    storefront_enrollment_source: string | null;
  }>;

  if (customers.length === 0) {
    return NextResponse.json({ customers: [] });
  }

  // Order + commission roll-up per customer, in one query each.
  const ids = customers.map((c) => c.id);
  const { data: orders } = await supabaseAdmin
    .from("coffee_orders")
    .select("id, operator_id, total, tenant_price_total, commission_total, created_at")
    .eq("storefront_tenant_id", tenant.id)
    .in("operator_id", ids);
  const orderRows = (orders ?? []) as Array<{
    operator_id: string;
    total: number | null;
    tenant_price_total: number | null;
    commission_total: number | null;
    created_at: string;
  }>;

  const rollup = new Map<
    string,
    { orderCount: number; lifetimeSpend: number; lifetimeCommission: number; lastOrderAt: string | null }
  >();
  for (const id of ids) {
    rollup.set(id, {
      orderCount: 0,
      lifetimeSpend: 0,
      lifetimeCommission: 0,
      lastOrderAt: null,
    });
  }
  for (const o of orderRows) {
    const bucket = rollup.get(o.operator_id);
    if (!bucket) continue;
    bucket.orderCount += 1;
    bucket.lifetimeSpend += Number(o.tenant_price_total ?? o.total ?? 0);
    bucket.lifetimeCommission += Number(o.commission_total ?? 0);
    if (!bucket.lastOrderAt || o.created_at > bucket.lastOrderAt) {
      bucket.lastOrderAt = o.created_at;
    }
  }

  return NextResponse.json({
    customers: customers.map((c) => ({
      ...c,
      ...(rollup.get(c.id) ?? {
        orderCount: 0,
        lifetimeSpend: 0,
        lifetimeCommission: 0,
        lastOrderAt: null,
      }),
    })),
  });
}
