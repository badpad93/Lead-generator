import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";

/**
 * Owner assigns each enrolled customer to one of the three pricing
 * tiers (migration 185). Absent assignment = Tier 1.
 *
 * GET -> { assignments: { customer_profile_id: tier } }
 * PUT -> { entries: [{ customer_profile_id, tier }] }
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const { data } = await supabaseAdmin
    .from("storefront_customer_tiers")
    .select("customer_profile_id, tier")
    .eq("tenant_id", tenant.id);

  const assignments: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ customer_profile_id: string; tier: number }>) {
    assignments[r.customer_profile_id] = Number(r.tier);
  }
  return NextResponse.json({ assignments });
}

interface PutBody {
  entries: Array<{ customer_profile_id: string; tier: number }>;
}

export async function PUT(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as PutBody | null;
  const entries = (body?.entries ?? []).filter(
    (e) =>
      typeof e.customer_profile_id === "string" &&
      e.customer_profile_id &&
      Number.isInteger(e.tier) &&
      e.tier >= 1 &&
      e.tier <= 3,
  );
  if (entries.length === 0) {
    return NextResponse.json({ error: "entries[] required" }, { status: 400 });
  }

  // Only assign customers actually enrolled with THIS storefront —
  // an owner can't reach into another tenant's roster.
  const ids = entries.map((e) => e.customer_profile_id);
  const { data: enrolled } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("storefront_tenant_id", tenant.id)
    .in("id", ids);
  const enrolledIds = new Set(((enrolled ?? []) as Array<{ id: string }>).map((r) => r.id));
  const valid = entries.filter((e) => enrolledIds.has(e.customer_profile_id));
  if (valid.length === 0) {
    return NextResponse.json({ error: "No enrolled customers matched" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("storefront_customer_tiers")
    .upsert(
      valid.map((e) => ({
        tenant_id: tenant.id,
        customer_profile_id: e.customer_profile_id,
        tier: e.tier,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })),
      { onConflict: "tenant_id,customer_profile_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: valid.length });
}
