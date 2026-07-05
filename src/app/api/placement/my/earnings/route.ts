import { NextRequest, NextResponse } from "next/server";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/placement/my/earnings
 *
 * PP-facing dashboard data. Aggregates over marketplace_payouts scoped to
 * the authenticated partner, plus their submission activity (last N).
 *
 * Payout status meaning:
 *   awaiting_collection — operator invoice not yet paid; you're queued but
 *                          not billed to VC yet
 *   queued              — operator paid; QB Bill about to be created
 *   sent_to_qb          — QB Bill exists; you'll see it in QB / receive it
 *   paid                — payment released to you
 *   failed              — QB Bill creation errored; admin is looking at it
 */

export async function GET(req: NextRequest) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const url = new URL(req.url);
  const sinceDays = Math.max(1, Math.min(3650, Number(url.searchParams.get("since_days") || 365)));
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 100)));
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: payouts } = await supabaseAdmin
    .from("marketplace_payouts")
    .select(`
      id, submission_id, contract_id, amount, currency, status,
      qb_bill_id, qb_error, triggered_at, sent_at, paid_at, paid_method, paid_reference,
      contract:contract_id(title, tier, market_city, market_state),
      submission:submission_id(business_name, city, state, admin_status, operator_status)
    `)
    .eq("partner_id", user.id)
    .gte("triggered_at", cutoff)
    .order("triggered_at", { ascending: false })
    .limit(limit);

  const payoutRows = payouts || [];

  const summary = {
    awaiting_collection_cents: 0,
    queued_cents: 0,
    sent_to_qb_cents: 0,
    paid_cents: 0,
    failed_cents: 0,
    lifetime_paid_cents: 0,
    row_count: payoutRows.length,
  };
  for (const p of payoutRows) {
    const cents = Math.round(Number(p.amount || 0) * 100);
    if (p.status === "awaiting_collection") summary.awaiting_collection_cents += cents;
    else if (p.status === "queued") summary.queued_cents += cents;
    else if (p.status === "sent_to_qb") summary.sent_to_qb_cents += cents;
    else if (p.status === "paid") { summary.paid_cents += cents; summary.lifetime_paid_cents += cents; }
    else if (p.status === "failed") summary.failed_cents += cents;
  }

  // Recent submission activity (approved-or-pending, includes operator decision)
  const { data: submissions } = await supabaseAdmin
    .from("placement_submissions")
    .select(`
      id, contract_id, business_name, city, state,
      admin_status, operator_status, created_at,
      contract:contract_id(title, tier)
    `)
    .eq("partner_id", user.id)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(50);

  // Active contract count (accepted but not yet fulfilled from the PP's side)
  const { count: activeAcceptances } = await supabaseAdmin
    .from("placement_contract_acceptances")
    .select("*", { count: "exact", head: true })
    .eq("partner_id", user.id)
    .is("released_at", null);

  return NextResponse.json({
    summary,
    payouts: payoutRows,
    submissions: submissions || [],
    active_acceptances: activeAcceptances || 0,
  });
}
