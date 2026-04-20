import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "ytd" | "custom";

function periodStart(period: Period): Date {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case "daily":
      d.setHours(0, 0, 0, 0);
      return d;
    case "weekly": {
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "monthly":
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case "quarterly": {
      const q = Math.floor(d.getMonth() / 3) * 3;
      return new Date(d.getFullYear(), q, 1);
    }
    case "yearly":
    case "ytd":
      return new Date(d.getFullYear(), 0, 1);
    case "custom":
      return new Date(d.getFullYear(), 0, 1);
  }
}

/**
 * GET /api/sales/results?period=<period>&user_id=<id>&start_date=<iso>&end_date=<iso>&market_id=<id>
 *
 * Admin / director_of_sales: see all deals, leads, orders across the org.
 * Market leader: see results for reps in their market(s).
 * Optionally pass user_id to filter to one rep.
 * Custom date range: period=custom&start_date=2025-01-01&end_date=2025-12-31
 */
export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const period = (url.searchParams.get("period") || "monthly") as Period;
  const filterUserId = url.searchParams.get("user_id") || null;
  const marketId = url.searchParams.get("market_id") || null;
  const elevated = isElevatedRole(user.role);

  // Determine which user IDs this requester can see
  let allowedUserIds: string[] | null = null; // null = no filter (see all)

  if (elevated) {
    // Admin/DOS can see everything, optionally filtered
    if (marketId) {
      const { data: members } = await supabaseAdmin
        .from("market_members")
        .select("user_id")
        .eq("market_id", marketId);
      allowedUserIds = (members || []).map((m) => m.user_id);
    }
  } else if (user.role === "market_leader") {
    // Market leaders see reps in their market(s)
    const { data: leaderOf } = await supabaseAdmin
      .from("market_leaders")
      .select("market_id")
      .eq("user_id", user.id);
    const leaderMarketIds = (leaderOf || []).map((m) => m.market_id);

    if (leaderMarketIds.length === 0) {
      allowedUserIds = [user.id];
    } else {
      let membersQuery = supabaseAdmin
        .from("market_members")
        .select("user_id");
      if (marketId && leaderMarketIds.includes(marketId)) {
        membersQuery = membersQuery.eq("market_id", marketId);
      } else {
        membersQuery = membersQuery.in("market_id", leaderMarketIds);
      }
      const { data: members } = await membersQuery;
      allowedUserIds = (members || []).map((m) => m.user_id);
      if (!allowedUserIds.includes(user.id)) allowedUserIds.push(user.id);
    }

    // If filtering to a specific user, verify they're in the allowed set
    if (filterUserId && !allowedUserIds.includes(filterUserId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    // Regular sales rep sees only own data
    if (filterUserId && filterUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    allowedUserIds = [user.id];
  }

  // Determine date range
  let since: string;
  let until: string | null = null;

  if (period === "custom") {
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");
    if (!startDate) {
      return NextResponse.json({ error: "start_date required for custom period" }, { status: 400 });
    }
    since = new Date(startDate).toISOString();
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      until = end.toISOString();
    }
  } else {
    since = periodStart(period).toISOString();
  }

  // Effective filter: specific user or set of allowed users
  const targetUserId = filterUserId || null;

  // --- Leads ---
  let leadsQuery = supabaseAdmin
    .from("sales_leads")
    .select("id, status, created_at")
    .gte("created_at", since);
  if (until) leadsQuery = leadsQuery.lte("created_at", until);

  if (targetUserId) {
    leadsQuery = leadsQuery.or(`assigned_to.eq.${targetUserId},created_by.eq.${targetUserId}`);
  } else if (allowedUserIds) {
    const orClauses = allowedUserIds.map((uid) => `assigned_to.eq.${uid},created_by.eq.${uid}`).join(",");
    leadsQuery = leadsQuery.or(orClauses);
  }

  const { data: leads } = await leadsQuery;

  // --- Deals ---
  let dealsQuery = supabaseAdmin
    .from("sales_deals")
    .select("id, stage, value, created_at, locked_at");

  if (targetUserId) {
    dealsQuery = dealsQuery.eq("assigned_to", targetUserId);
  } else if (allowedUserIds) {
    dealsQuery = dealsQuery.in("assigned_to", allowedUserIds);
  }

  const { data: allDeals } = await dealsQuery;

  const deals = (allDeals || []).filter((d) => {
    if (d.created_at < since) return false;
    if (until && d.created_at > until) return false;
    return true;
  });

  // --- Orders ---
  let ordersQuery = supabaseAdmin
    .from("sales_orders")
    .select("id, status, total_value, deal_id, created_at")
    .gte("created_at", since);
  if (until) ordersQuery = ordersQuery.lte("created_at", until);

  if (targetUserId) {
    ordersQuery = ordersQuery.eq("created_by", targetUserId);
  } else if (allowedUserIds) {
    ordersQuery = ordersQuery.in("created_by", allowedUserIds);
  }

  const { data: orders } = await ordersQuery;

  // --- Goal ---
  const goalPeriod = period === "ytd" ? "yearly" : period === "custom" ? "yearly" : period;
  const goalUserId = filterUserId || user.id;
  const { data: goal } = await supabaseAdmin
    .from("sales_goals")
    .select("*")
    .eq("user_id", goalUserId)
    .eq("period", goalPeriod)
    .maybeSingle();

  // --- Compute metrics ---
  const leadsByStatus: Record<string, number> = {
    new: 0, contacted: 0, qualified: 0, unqualified: 0, lost: 0,
  };
  for (const l of leads || []) {
    leadsByStatus[l.status] = (leadsByStatus[l.status] || 0) + 1;
  }

  const dealsByStage: Record<string, number> = {};
  let pipelineValue = 0;
  for (const d of deals) {
    dealsByStage[d.stage] = (dealsByStage[d.stage] || 0) + 1;
    pipelineValue += Number(d.value || 0);
  }

  // Won metrics: orders linked to deals in the period
  let wonValue = 0;
  let wonCount = 0;
  const wonDealIds = new Set<string>();
  for (const o of orders || []) {
    if (o.deal_id && !wonDealIds.has(o.deal_id)) {
      wonDealIds.add(o.deal_id);
      wonValue += Number(o.total_value || 0);
      wonCount += 1;
    }
  }

  const orderRevenue = (orders || []).reduce(
    (sum, o) => sum + Number(o.total_value || 0), 0
  );
  const completedOrders = (orders || []).filter((o) => o.status === "completed").length;

  const totalDeals = (allDeals || []).length;
  const closeRate = totalDeals > 0 ? wonCount / totalDeals : 0;

  return NextResponse.json({
    period,
    user_id: filterUserId || (elevated || user.role === "market_leader" ? "all" : user.id),
    market_id: marketId || null,
    since,
    until: until || null,
    metrics: {
      leads_total: (leads || []).length,
      leads_by_status: leadsByStatus,
      deals_total: deals.length,
      deals_by_stage: dealsByStage,
      deals_won: wonCount,
      pipeline_value: pipelineValue,
      won_value: wonValue,
      orders_total: (orders || []).length,
      orders_completed: completedOrders,
      order_revenue: orderRevenue,
      conversion_rate: closeRate,
    },
    goal: goal || null,
  });
}
