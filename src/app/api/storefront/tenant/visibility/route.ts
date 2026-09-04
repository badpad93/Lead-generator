import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";

/**
 * Per-tenant product visibility — the storefront owner's hide/unhide
 * controls. A hidden product disappears from that tenant's public
 * page, price list, quote and checkout; the main marketplace and
 * every other storefront are untouched.
 *
 * GET  -> { hidden: string[] }               product ids hidden for this tenant
 * PUT  -> { entries: [{ product_id, hidden }] }  toggle rows
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from("storefront_tenant_hidden_products")
    .select("product_id")
    .eq("tenant_id", tenant.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    hidden: ((data ?? []) as Array<{ product_id: string }>).map((r) => r.product_id),
  });
}

interface VisibilityBody {
  entries: Array<{ product_id: string; hidden: boolean }>;
}

export async function PUT(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as VisibilityBody | null;
  const entries = (body?.entries ?? []).filter(
    (e) => typeof e.product_id === "string" && typeof e.hidden === "boolean",
  );
  if (entries.length === 0) {
    return NextResponse.json({ error: "entries[] required" }, { status: 400 });
  }

  const toHide = entries.filter((e) => e.hidden).map((e) => e.product_id);
  const toShow = entries.filter((e) => !e.hidden).map((e) => e.product_id);

  if (toHide.length > 0) {
    const { error } = await supabaseAdmin
      .from("storefront_tenant_hidden_products")
      .upsert(
        toHide.map((product_id) => ({ tenant_id: tenant.id, product_id })),
        { onConflict: "tenant_id,product_id", ignoreDuplicates: true },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (toShow.length > 0) {
    const { error } = await supabaseAdmin
      .from("storefront_tenant_hidden_products")
      .delete()
      .eq("tenant_id", tenant.id)
      .in("product_id", toShow);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, hidden_count: toHide.length, shown_count: toShow.length });
}
