import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

const ADMIN_ROLES = new Set(["admin", "director_of_sales", "market_leader"]);

/**
 * GET /api/admin/manufacturers
 *   Lists manufacturer_partners with aggregate counts (equipment,
 *   pending pricing exceptions, orders) for the admin marketplace
 *   overview.
 */
export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !ADMIN_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: partners, error } = await supabaseAdmin
    .from("manufacturer_partners")
    .select(
      "id, legal_company_name, dba_or_brand, entity_type, primary_contact_name, primary_contact_email, status, current_agreement_version, payout_status, dwolla_verified_at, submitted_at, approved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate: equipment count + pending exception count per partner.
  const ids = (partners ?? []).map((p) => p.id as string);
  const summary: Record<string, { equipment: number; pending_exceptions: number; orders: number; sales_cents: number }> = {};
  if (ids.length > 0) {
    const [{ data: eqRows }, { data: excRows }, { data: orderRows }] = await Promise.all([
      supabaseAdmin
        .from("machine_listings")
        .select("manufacturer_partner_id, status")
        .in("manufacturer_partner_id", ids),
      supabaseAdmin
        .from("machine_listing_pricing_exceptions")
        .select("manufacturer_partner_id, status")
        .in("manufacturer_partner_id", ids)
        .eq("status", "pending"),
      supabaseAdmin
        .from("machine_listing_purchases")
        .select("manufacturer_partner_id, amount_cents")
        .in("manufacturer_partner_id", ids),
    ]);
    for (const id of ids) summary[id] = { equipment: 0, pending_exceptions: 0, orders: 0, sales_cents: 0 };
    for (const r of eqRows ?? []) {
      const pid = r.manufacturer_partner_id as string;
      if (summary[pid]) summary[pid].equipment++;
    }
    for (const r of excRows ?? []) {
      const pid = r.manufacturer_partner_id as string;
      if (summary[pid]) summary[pid].pending_exceptions++;
    }
    for (const r of orderRows ?? []) {
      const pid = r.manufacturer_partner_id as string;
      if (!summary[pid]) continue;
      summary[pid].orders++;
      summary[pid].sales_cents += Number(r.amount_cents ?? 0);
    }
  }

  return NextResponse.json({
    partners: (partners ?? []).map((p) => ({ ...p, summary: summary[p.id as string] ?? null })),
  });
}
