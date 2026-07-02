import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * Aggregate marketplace stats for the admin dashboard.
 * Returns everything in one shot — fast and simple to render.
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: contracts },
    { data: submissions },
    { data: payoutsRecent },
    { data: invoicesRecent },
    { data: partnersActive },
    { data: allPartners },
    { data: recentActivity },
  ] = await Promise.all([
    supabaseAdmin.from("placement_contracts").select("id, tier, status, locations_needed, locations_filled, created_at, deadline_at"),
    supabaseAdmin.from("placement_submissions").select("id, admin_status, operator_status, contract_id, partner_id, created_at"),
    supabaseAdmin.from("marketplace_payouts").select("id, amount, status, triggered_at, paid_at").gte("triggered_at", thirtyDaysAgo),
    supabaseAdmin.from("marketplace_operator_invoices").select("id, amount, status, triggered_at, paid_at").gte("triggered_at", thirtyDaysAgo),
    supabaseAdmin.from("placement_partners").select("id, business_name, rating, rating_count, active, onboarding_complete, submissions_accepted_count, submissions_total_count").eq("active", true).eq("onboarding_complete", true),
    supabaseAdmin.from("placement_partners").select("id"),
    supabaseAdmin.from("placement_submission_activity").select("id, activity_type, created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  // ─── Contracts by tier + status ────────────────────────────────────────
  const contractsByTierStatus: Record<string, Record<string, number>> = { "1": {}, "2": {}, "3": {} };
  for (const c of contracts || []) {
    const t = String(c.tier);
    contractsByTierStatus[t] = contractsByTierStatus[t] || {};
    contractsByTierStatus[t][c.status] = (contractsByTierStatus[t][c.status] || 0) + 1;
  }

  // ─── Avg time-to-fill (fulfilled contracts) ────────────────────────────
  // We approximate with (deadline_at OR now) - created_at when locations_filled >= locations_needed.
  const fulfilled = (contracts || []).filter((c) => c.status === "fulfilled");
  // We don't have a fulfilled_at column; use activity log entries would be ideal.
  // For MVP: proxy with created_at diff to average submission acceptance.
  const acceptedSubmissions = (submissions || []).filter((s) => s.operator_status === "accepted" && s.created_at);
  let avgDaysSubmissionToAccept = 0;
  if (acceptedSubmissions.length > 0) {
    // We don't track accepted_at; use created_at as proxy for both.
    // Skip metric if column missing — placeholder for future column.
    avgDaysSubmissionToAccept = 0;
  }

  // ─── Submission funnel ─────────────────────────────────────────────────
  const submissionsByAdminStatus = {
    pending: 0,
    approved: 0,
    changes_requested: 0,
    rejected: 0,
  };
  const submissionsByOperatorStatus = { pending: 0, accepted: 0, rejected: 0 };
  for (const s of submissions || []) {
    const a = s.admin_status as keyof typeof submissionsByAdminStatus;
    if (a in submissionsByAdminStatus) submissionsByAdminStatus[a]++;
    const o = s.operator_status as keyof typeof submissionsByOperatorStatus;
    if (o in submissionsByOperatorStatus) submissionsByOperatorStatus[o]++;
  }

  // ─── Payout run-rate (30 days) ─────────────────────────────────────────
  const payoutsTotalAmount = (payoutsRecent || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const payoutsPaidAmount = (payoutsRecent || [])
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const invoicesTotalAmount = (invoicesRecent || []).reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const invoicesPaidAmount = (invoicesRecent || [])
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.amount || 0), 0);

  // Platform revenue = operator invoices - partner payouts (the $100 slice)
  const platformRevenue = invoicesTotalAmount - payoutsTotalAmount;

  // ─── Partner leaderboard (top 10 by accepted count) ───────────────────
  const submissionsByPartner: Record<string, { total: number; accepted: number }> = {};
  for (const s of submissions || []) {
    const p = s.partner_id;
    submissionsByPartner[p] = submissionsByPartner[p] || { total: 0, accepted: 0 };
    submissionsByPartner[p].total++;
    if (s.operator_status === "accepted") submissionsByPartner[p].accepted++;
  }

  const leaderboard = (partnersActive || [])
    .map((p) => {
      const stats = submissionsByPartner[p.id] || { total: p.submissions_total_count || 0, accepted: p.submissions_accepted_count || 0 };
      const closeRate = stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0;
      return {
        id: p.id,
        business_name: p.business_name,
        rating: p.rating,
        rating_count: p.rating_count,
        submissions_total: stats.total,
        submissions_accepted: stats.accepted,
        close_rate: closeRate,
      };
    })
    .sort((a, b) => b.submissions_accepted - a.submissions_accepted || b.close_rate - a.close_rate)
    .slice(0, 10);

  return NextResponse.json({
    // Totals
    total_contracts: contracts?.length || 0,
    total_submissions: submissions?.length || 0,
    total_partners: allPartners?.length || 0,
    active_partners: partnersActive?.length || 0,
    fulfilled_contracts: fulfilled.length,

    // Breakdowns
    contracts_by_tier_status: contractsByTierStatus,
    submissions_by_admin_status: submissionsByAdminStatus,
    submissions_by_operator_status: submissionsByOperatorStatus,

    // Money (30 days)
    payouts_total_30d: payoutsTotalAmount,
    payouts_paid_30d: payoutsPaidAmount,
    invoices_total_30d: invoicesTotalAmount,
    invoices_paid_30d: invoicesPaidAmount,
    platform_revenue_30d: platformRevenue,

    // Leaderboard
    partner_leaderboard: leaderboard,

    // Placeholder — see comment above
    avg_days_submission_to_accept: avgDaysSubmissionToAccept,

    recent_activity: recentActivity || [],
  });
}
