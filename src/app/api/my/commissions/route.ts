import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { summarizeCommissionsForUser } from "@/lib/commissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/my/commissions
 *
 * Rep-facing: two blocks in one response so the rep sees the whole picture.
 *
 *   summary + rows  — from commission_ledger. Auto-earn from paid orders +
 *                     attribution rules. This is the money spine.
 *
 *   adjustments     — from sales_commissions. Manual bonuses/overrides
 *                     entered by hand by director_of_sales/market_leader.
 *                     Includes totals + row list scoped to the caller.
 *
 * The rep's true "net available" adds approved-but-unpaid adjustments to
 * the ledger net_available so we don't understate what they're owed.
 */

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sinceDays = Math.max(1, Math.min(3650, Number(url.searchParams.get("since_days") || 365)));
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 200)));
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const summary = await summarizeCommissionsForUser(userId, sinceDays);

  const { data: rows } = await supabaseAdmin
    .from("commission_ledger")
    .select(`
      id, order_id, role_code, attribution_percentage, basis_cents, rate_bps, amount_cents,
      hold_days, status, earned_at, clearable_at, paid_at, reversed_of_id, reversal_reason,
      order:order_id(id, total_value, order_type, order_status, created_at)
    `)
    .eq("user_id", userId)
    .gte("earned_at", cutoff)
    .order("earned_at", { ascending: false })
    .limit(limit);

  // Manual adjustments — legacy sales_commissions table used by director /
  // market_leader for bonuses + overrides. Kept alongside the ledger so
  // reps see everything on one page.
  const { data: adjustmentRows } = await supabaseAdmin
    .from("sales_commissions")
    .select("id, deal_id, order_id, commission_rate, deal_value, commission_amount, status, paid_at, notes, created_at")
    .eq("user_id", userId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);

  const adjustments = {
    pending_cents: 0,
    approved_unpaid_cents: 0,
    paid_cents: 0,
    total_cents: 0,
    row_count: (adjustmentRows || []).length,
  };
  for (const a of adjustmentRows || []) {
    const cents = Math.round(Number(a.commission_amount || 0) * 100);
    adjustments.total_cents += cents;
    if (a.status === "pending") adjustments.pending_cents += cents;
    else if (a.status === "approved" && !a.paid_at) adjustments.approved_unpaid_cents += cents;
    else if (a.status === "paid" || a.paid_at) adjustments.paid_cents += cents;
  }

  // True net available = ledger net + approved-but-unpaid manual adjustments.
  // Pending adjustments aren't yet approved so they don't count toward
  // "available".
  const combined_net_available_cents = summary.net_available_cents + adjustments.approved_unpaid_cents;

  return NextResponse.json({
    summary: { ...summary, combined_net_available_cents },
    rows: rows || [],
    adjustments,
    adjustment_rows: adjustmentRows || [],
  });
}
