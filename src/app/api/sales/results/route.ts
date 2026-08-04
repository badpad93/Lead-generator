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

  // --- Orders + Quotes (sales_orders holds both, distinguished by document_type) ---
  // Prior code summed ALL sales_orders rows into revenue, which counted
  // quotes as revenue and inflated every downstream metric. We now select
  // document_type and split them; falls back gracefully if the column
  // doesn't exist on very old schemas (all rows treated as orders then).
  let ordersQuery = supabaseAdmin
    .from("sales_orders")
    .select("id, status, payment_status, total_value, deal_id, account_id, created_at, document_type")
    .gte("created_at", since);
  if (until) ordersQuery = ordersQuery.lte("created_at", until);

  if (targetUserId) {
    ordersQuery = ordersQuery.eq("created_by", targetUserId);
  } else if (allowedUserIds) {
    ordersQuery = ordersQuery.in("created_by", allowedUserIds);
  }

  // eslint-disable-next-line prefer-const
  let { data: allSalesOrderRows, error: ordersError } = await ordersQuery;

  if (ordersError && String(ordersError.message).includes("document_type")) {
    let retry = supabaseAdmin
      .from("sales_orders")
      .select("id, status, payment_status, total_value, deal_id, account_id, created_at")
      .gte("created_at", since);
    if (until) retry = retry.lte("created_at", until);
    if (targetUserId) {
      retry = retry.eq("created_by", targetUserId);
    } else if (allowedUserIds) {
      retry = retry.in("created_by", allowedUserIds);
    }
    const fallback = await retry;
    // Legacy rows have no document_type — cast to the wider shape and
    // let the null-coalesce below default them to 'order'.
    allSalesOrderRows = (fallback.data ?? []).map((r) => ({ ...r, document_type: null }));
  }

  const rows = allSalesOrderRows || [];
  // Treat NULL document_type as 'order' (legacy rows created before the
  // column existed were all orders). Quotes are filtered out so they
  // never contribute to orders_total / order_revenue / deals_won.
  const orders = rows.filter((r) => (r.document_type ?? "order") === "order");
  const quotesInPeriod = rows.filter((r) => r.document_type === "quote");

  // --- Commissions ---
  // commission_ledger is the current source (migration 109). The older
  // sales_commissions table (migration 028) is deprecated and empty
  // in production — querying it always returned $0. Read from ledger
  // and convert amount_cents → dollars for the payload.
  let commissionsQuery = supabaseAdmin
    .from("commission_ledger")
    .select("id, amount_cents, status, earned_at")
    .gte("earned_at", since);
  if (until) commissionsQuery = commissionsQuery.lte("earned_at", until);

  if (targetUserId) {
    commissionsQuery = commissionsQuery.eq("user_id", targetUserId);
  } else if (allowedUserIds) {
    commissionsQuery = commissionsQuery.in("user_id", allowedUserIds);
  }

  // eslint-disable-next-line prefer-const
  let { data: commissions, error: commissionErr } = await commissionsQuery;
  if (commissionErr) {
    // Fallback for schemas that still only have sales_commissions.
    let retry = supabaseAdmin
      .from("sales_commissions")
      .select("id, commission_amount, status, created_at")
      .gte("created_at", since);
    if (until) retry = retry.lte("created_at", until);
    if (targetUserId) retry = retry.eq("user_id", targetUserId);
    else if (allowedUserIds) retry = retry.in("user_id", allowedUserIds);
    const fallback = await retry;
    // Normalize old shape (commission_amount in dollars) to new shape
    // (amount_cents) so the aggregator below stays uniform.
    commissions = (fallback.data ?? []).map((r) => ({
      id: (r as { id: string }).id,
      amount_cents: Math.round(Number((r as { commission_amount: number }).commission_amount ?? 0) * 100),
      status: (r as { status: string }).status,
      earned_at: (r as { created_at: string }).created_at,
    }));
  }

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

  // Won metrics — redefined to match Completed Orders / Order Revenue
  // definition. Prior formula was "unique deal_ids on any order in the
  // period", which returned 0 whenever orders had no deal_id (which is
  // typical for direct-created and manual one-off orders). New formula:
  // orders that are completed or paid.
  const wonOrders = (orders || []).filter(
    (o) => o.status === "completed" || (o as { payment_status?: string }).payment_status === "paid",
  );
  const wonCount = wonOrders.length;
  const wonValue = wonOrders.reduce((sum, o) => sum + Number(o.total_value || 0), 0);

  const orderRevenue = (orders || []).reduce(
    (sum, o) => sum + Number(o.total_value || 0), 0
  );
  const completedOrders = (orders || []).filter((o) => o.status === "completed").length;

  // Close rate = quotes-in-period that turned into a paid order /
  // quotes-in-period. "Paid" is strictly payment_status='paid'.
  //
  // Match permissively — a quote counts as closed if EITHER its
  // deal_id matches a paid order's deal_id OR its account_id
  // matches a paid order's account_id created at/after the quote.
  // Deal-flow-less pipelines were previously reading 0% because
  // deal_id is rarely populated on real quotes or orders.
  let closeRate = 0;
  if (quotesInPeriod.length > 0) {
    const quoteDealIds = Array.from(
      new Set(quotesInPeriod.map((q) => q.deal_id).filter(Boolean) as string[]),
    );
    const quoteAccountIds = Array.from(
      new Set(
        quotesInPeriod
          .map((q) => (q as { account_id?: string | null }).account_id)
          .filter((v): v is string => !!v),
      ),
    );
    const paidByDeal = new Set<string>();
    const paidByAccount = new Map<string, string[]>();
    if (quoteDealIds.length > 0 || quoteAccountIds.length > 0) {
      let paidQuery = supabaseAdmin
        .from("sales_orders")
        .select("deal_id, account_id, created_at, created_by")
        // "Closed" here = payment_status='paid' OR either status column
        // = 'completed', matching the Won Revenue definition on this
        // same page so the two numbers stay coherent.
        .or("payment_status.eq.paid,status.eq.completed,order_status.eq.completed");
      if (targetUserId) paidQuery = paidQuery.eq("created_by", targetUserId);
      else if (allowedUserIds) paidQuery = paidQuery.in("created_by", allowedUserIds);
      const clauses: string[] = [];
      if (quoteDealIds.length > 0) clauses.push(`deal_id.in.(${quoteDealIds.join(",")})`);
      if (quoteAccountIds.length > 0) clauses.push(`account_id.in.(${quoteAccountIds.join(",")})`);
      paidQuery = paidQuery.or(clauses.join(","));
      const { data: paidRows } = await paidQuery;
      for (const p of (paidRows ?? []) as {
        deal_id: string | null;
        account_id: string | null;
        created_at: string;
      }[]) {
        if (p.deal_id) paidByDeal.add(p.deal_id);
        if (p.account_id) {
          const list = paidByAccount.get(p.account_id) ?? [];
          list.push(p.created_at);
          paidByAccount.set(p.account_id, list);
        }
      }
      for (const [k, v] of paidByAccount) {
        v.sort();
        paidByAccount.set(k, v);
      }
    }
    const closedQuotes = quotesInPeriod.filter((q) => {
      if (q.deal_id && paidByDeal.has(q.deal_id)) return true;
      const accountId = (q as { account_id?: string | null }).account_id;
      if (!accountId) return false;
      const paidAts = paidByAccount.get(accountId);
      return paidAts?.some((at) => at >= q.created_at) ?? false;
    }).length;
    closeRate = closedQuotes / quotesInPeriod.length;
  }

  // Commission metrics — commission_ledger stores amount_cents.
  // status enum: 'pending' | 'held' | 'earned' | 'reversed' | 'paid' |
  // 'cancelled'. Group them into the four buckets the dashboard shows:
  // pending → pending; held+earned → approved; paid → paid; anything
  // else drops out.
  let commissionCentsTotal = 0;
  let commissionCentsPending = 0;
  let commissionCentsApproved = 0;
  let commissionCentsPaid = 0;
  for (const c of commissions || []) {
    const cents = Number((c as { amount_cents?: number }).amount_cents ?? 0);
    commissionCentsTotal += cents;
    const status = (c as { status: string }).status;
    if (status === "pending") commissionCentsPending += cents;
    else if (status === "earned" || status === "held" || status === "approved") commissionCentsApproved += cents;
    else if (status === "paid") commissionCentsPaid += cents;
  }
  const commissionTotal = commissionCentsTotal / 100;
  const commissionPending = commissionCentsPending / 100;
  const commissionApproved = commissionCentsApproved / 100;
  const commissionPaid = commissionCentsPaid / 100;

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
      commission_total: commissionTotal,
      commission_pending: commissionPending,
      commission_approved: commissionApproved,
      commission_paid: commissionPaid,
    },
    goal: goal || null,
  });
}
