import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTenantBalances } from "@/lib/storefront/commissions";

/**
 * Admin: commission ledger for a tenant + balance rollup for the
 * admin storefronts detail page. Optional ?status filter.
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  if (!tenantId) return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  const status = req.nextUrl.searchParams.get("status");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 100), 500);

  let q = supabaseAdmin
    .from("storefront_commission_ledger")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("earned_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const balances = await getTenantBalances(tenantId);

  return NextResponse.json({ rows: data ?? [], balances });
}
