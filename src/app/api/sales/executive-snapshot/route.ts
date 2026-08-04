import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

/**
 * GET /api/sales/executive-snapshot
 *
 * The unified operating snapshot for the /sales dashboard header. Groups
 * every commercial artifact (quotes, orders, agreements, workflows,
 * leads, deals, commissions) into one payload with definitions locked
 * against what the business actually asked for:
 *
 *   quotes.sent           — quotes created in period (document_type='quote')
 *   quotes.converted      — quotes with a matching order (same deal_id)
 *   quotes.outstanding    — quotes currently open (status='sent') regardless of period
 *   orders.placed         — orders created in period (document_type='order')
 *   orders.completed      — orders in period with status='completed'
 *   orders.outstanding    — orders currently open regardless of period
 *   orders.revenue        — sum of total_value for orders in period (quotes never counted)
 *   agreements.crm_signed — purchase_agreements where agreement_status='signed'
 *                           (= both operator + Apex signed) in period
 *   agreements.provider_signed — user_agreements where status='fully_executed'
 *   workflows.*           — proxied from /api/workflows/metrics semantics
 *
 * Scope:
 *   - admin / director_of_sales    → company-wide (or filter to a market_id/user_id)
 *   - market_leader                → their market's reps + themselves
 *   - sales / sales_manager        → their own numbers only
 *
 * Period options match /api/sales/results: daily, weekly, monthly,
 * quarterly, yearly, ytd, custom (with start_date + end_date).
 */

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

function periodLabel(period: Period): string {
  return {
    daily: "Today",
    weekly: "This Week",
    monthly: "This Month",
    quarterly: "This Quarter",
    yearly: "This Year",
    ytd: "Year to Date",
    custom: "Custom Range",
  }[period];
}

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const period = (url.searchParams.get("period") || "monthly") as Period;
  const filterUserId = url.searchParams.get("user_id") || null;
  const marketId = url.searchParams.get("market_id") || null;
  const elevated = isElevatedRole(user.role);

  // ─── Resolve scope (reuses the exact same logic as /api/sales/results) ─
  let allowedUserIds: string[] | null = null;
  let companyWide = false;

  if (elevated) {
    if (marketId) {
      const { data: members } = await supabaseAdmin
        .from("market_members")
        .select("user_id")
        .eq("market_id", marketId);
      allowedUserIds = (members || []).map((m) => m.user_id);
    } else if (!filterUserId) {
      companyWide = true;
    }
  } else if (user.role === "market_leader") {
    const { data: leaderOf } = await supabaseAdmin
      .from("market_leaders")
      .select("market_id")
      .eq("user_id", user.id);
    const leaderMarketIds = (leaderOf || []).map((m) => m.market_id);
    if (leaderMarketIds.length === 0) {
      allowedUserIds = [user.id];
    } else {
      let membersQuery = supabaseAdmin.from("market_members").select("user_id");
      if (marketId && leaderMarketIds.includes(marketId)) {
        membersQuery = membersQuery.eq("market_id", marketId);
      } else {
        membersQuery = membersQuery.in("market_id", leaderMarketIds);
      }
      const { data: members } = await membersQuery;
      allowedUserIds = (members || []).map((m) => m.user_id);
      if (!allowedUserIds.includes(user.id)) allowedUserIds.push(user.id);
    }
    if (filterUserId && !allowedUserIds.includes(filterUserId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    if (filterUserId && filterUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    allowedUserIds = [user.id];
  }

  const targetUserId = filterUserId || null;

  // ─── Resolve period ─────────────────────────────────────────────────
  let since: string;
  let until: string | null = null;
  if (period === "custom") {
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");
    if (!startDate) return NextResponse.json({ error: "start_date required" }, { status: 400 });
    since = new Date(startDate).toISOString();
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      until = end.toISOString();
    }
  } else {
    since = periodStart(period).toISOString();
  }

  // Helper: apply the scope filter to a query on a table with `created_by`.
  function scopeByCreator<T>(q: T, column = "created_by"): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = q;
    if (targetUserId) query = query.eq(column, targetUserId);
    else if (allowedUserIds) query = query.in(column, allowedUserIds);
    return query;
  }

  // ─── Sales orders + quotes (split by document_type) ─────────────────
  // account_id is fetched so close-rate matching can fall back to
  // "same account had a paid order after this quote" — a lot of real
  // quotes never carry a deal_id, so deal_id-only matching under-
  // counts closes badly.
  let ordersQuery = supabaseAdmin
    .from("sales_orders")
    .select("id, status, total_value, deal_id, account_id, lead_id, created_at, document_type")
    .gte("created_at", since);
  if (until) ordersQuery = ordersQuery.lte("created_at", until);
  ordersQuery = scopeByCreator(ordersQuery);

  // eslint-disable-next-line prefer-const
  let { data: periodRows, error: soErr } = await ordersQuery;
  if (soErr && String(soErr.message).includes("document_type")) {
    let retry = supabaseAdmin
      .from("sales_orders")
      .select("id, status, total_value, deal_id, account_id, lead_id, created_at")
      .gte("created_at", since);
    if (until) retry = retry.lte("created_at", until);
    retry = scopeByCreator(retry);
    const fallback = await retry;
    periodRows = (fallback.data ?? []).map((r) => ({ ...r, document_type: null }));
  }
  const orderRows = (periodRows ?? []).filter((r) => (r.document_type ?? "order") === "order");
  const quoteRows = (periodRows ?? []).filter((r) => r.document_type === "quote");

  // For "outstanding" (unbounded by period), separately query open rows.
  const outstandingQuery = scopeByCreator(
    supabaseAdmin.from("sales_orders").select("id, deal_id, status, document_type").in("status", ["draft", "sent"]),
  );
  const { data: openRowsRaw } = await outstandingQuery;
  const openRows = (openRowsRaw ?? []) as { id: string; deal_id: string | null; status: string; document_type: string | null }[];
  const outstandingOrders = openRows.filter((r) => (r.document_type ?? "order") === "order" && r.status !== "draft").length;
  const outstandingQuotes = openRows.filter((r) => r.document_type === "quote" && r.status === "sent").length;

  // Quotes converted: quotes in period whose deal_id has any matching order row
  // in sales_orders (any period). Requires a lookup of orders by those deal_ids.
  const quoteDealIds = Array.from(new Set(quoteRows.map((q) => q.deal_id).filter(Boolean))) as string[];
  let convertedDealIdSet = new Set<string>();
  if (quoteDealIds.length > 0) {
    const { data: matchingOrders } = await supabaseAdmin
      .from("sales_orders")
      .select("deal_id, document_type")
      .in("deal_id", quoteDealIds);
    convertedDealIdSet = new Set(
      (matchingOrders ?? [])
        .filter((r) => (r.document_type ?? "order") === "order")
        .map((r) => r.deal_id)
        .filter(Boolean) as string[],
    );
  }
  const quotesConverted = quoteRows.filter((q) => q.deal_id && convertedDealIdSet.has(q.deal_id)).length;

  const orderRevenue = orderRows.reduce((s, o) => s + Number(o.total_value ?? 0), 0);
  const quoteTotalValue = quoteRows.reduce((s, q) => s + Number(q.total_value ?? 0), 0);
  const ordersCompleted = orderRows.filter((o) => o.status === "completed").length;

  // Close rate = quotes-in-period that turned into a closed order,
  // divided by quotes sent in period. "Closed" here is
  // payment_status='paid' OR status='completed' — this matches the
  // Won Revenue definition on the Results tile so the two numbers
  // stay coherent (many teams mark orders completed without
  // literally touching payment_status='paid').
  //
  // Matching is permissive because real-world quotes often skip
  // deal-flow: a quote counts as closed if ANY of these hold —
  //   (a) its deal_id matches a closed order's deal_id, OR
  //   (b) its account_id matches a closed order's account_id and
  //       that closed order was created at/after the quote (i.e.
  //       plausibly resulted from it).
  // Match quotes to closed orders on THREE axes (any hit counts):
  //   1. deal_id
  //   2. lead_id
  //   3. account_id, when a closed order for that account exists at/after the quote
  // "Closed" = payment_status='paid' OR status='completed' OR
  // order_status='completed'. No document_type filter — legacy orders
  // with null document_type still count.
  let quotesClosed = 0;
  const q2 = quoteRows as Array<{
    id: string;
    deal_id: string | null;
    account_id: string | null;
    lead_id: string | null;
    created_at: string;
  }>;

  if (q2.length > 0) {
    let paidQuery = supabaseAdmin
      .from("sales_orders")
      .select("id, deal_id, account_id, lead_id, created_at, document_type")
      .or("payment_status.eq.paid,status.eq.completed,order_status.eq.completed");
    paidQuery = scopeByCreator(paidQuery);
    const { data: paidRowsAll } = await paidQuery;
    const paid = ((paidRowsAll ?? []) as Array<{
      id: string;
      deal_id: string | null;
      account_id: string | null;
      lead_id: string | null;
      created_at: string;
      document_type: string | null;
    }>).filter((p) => p.document_type !== "quote");

    const paidByDeal = new Set(paid.map((p) => p.deal_id).filter(Boolean) as string[]);
    const paidByLead = new Set(paid.map((p) => p.lead_id).filter(Boolean) as string[]);
    const paidByAccount = new Map<string, string[]>();
    for (const p of paid) {
      if (!p.account_id) continue;
      const list = paidByAccount.get(p.account_id) ?? [];
      list.push(p.created_at);
      paidByAccount.set(p.account_id, list);
    }
    for (const [, v] of paidByAccount) v.sort();

    quotesClosed = q2.filter((q) => {
      if (q.deal_id && paidByDeal.has(q.deal_id)) return true;
      if (q.lead_id && paidByLead.has(q.lead_id)) return true;
      if (q.account_id) {
        const paidAts = paidByAccount.get(q.account_id);
        if (paidAts?.some((at) => at >= q.created_at)) return true;
      }
      return false;
    }).length;
  }
  const closeRate = q2.length > 0 ? quotesClosed / q2.length : 0;

  // ─── Purchase agreements (CRM: machine + location placement) ────────
  let agrQuery = supabaseAdmin
    .from("purchase_agreements")
    .select("id, agreement_status, created_at, created_by")
    .gte("created_at", since);
  if (until) agrQuery = agrQuery.lte("created_at", until);
  agrQuery = scopeByCreator(agrQuery);
  const { data: crmAgreementsPeriod } = await agrQuery;
  const crmAgrRows = crmAgreementsPeriod ?? [];

  const SENT_STATUSES = ["sent", "viewed", "partially_signed", "signed"];
  const AWAITING_STATUSES = ["sent", "viewed", "partially_signed"];
  const crmSent = crmAgrRows.filter((a) => SENT_STATUSES.includes(a.agreement_status)).length;
  const crmSigned = crmAgrRows.filter((a) => a.agreement_status === "signed").length;
  // Awaiting is CURRENT open (unbounded by period).
  const crmAwaitingQuery = scopeByCreator(
    supabaseAdmin
      .from("purchase_agreements")
      .select("id, agreement_status")
      .in("agreement_status", AWAITING_STATUSES),
  );
  const { data: crmAwaitingRows } = await crmAwaitingQuery;
  const crmAwaiting = (crmAwaitingRows ?? []).length;

  // ─── User agreements (Placement Provider + coffee_supply) ────────────
  // These aren't attributed to a sales rep, so they're only included in
  // company-wide / market-scoped views. For per-rep views they return 0.
  let providerSent = 0, providerSigned = 0, providerAwaiting = 0;
  const includeProviderAgreements = companyWide || (allowedUserIds && allowedUserIds.length > 1 && !targetUserId);
  if (includeProviderAgreements) {
    let uaQuery = supabaseAdmin
      .from("user_agreements")
      .select("id, status, agreement_type, created_at")
      .in("agreement_type", ["placement_provider", "coffee_supply"])
      .gte("created_at", since);
    if (until) uaQuery = uaQuery.lte("created_at", until);
    const { data: uaPeriod } = await uaQuery;
    const uaRows = uaPeriod ?? [];
    providerSent = uaRows.length;
    providerSigned = uaRows.filter((r) => r.status === "fully_executed").length;

    const { data: uaOpen } = await supabaseAdmin
      .from("user_agreements")
      .select("id, status")
      .in("agreement_type", ["placement_provider", "coffee_supply"])
      .eq("status", "provider_signed_pending_company_countersign");
    providerAwaiting = (uaOpen ?? []).length;
  }

  // ─── Workflows ──────────────────────────────────────────────────────
  // Company-wide only when the caller isn't scoped to one user. A
  // workflow counts as "open" until it reaches a terminal state — this
  // matches the workload endpoint definition so counts on the Exec
  // Snapshot and Team Workload views agree with each other.
  const TERMINAL = new Set(["completed", "cancelled", "refunded", "expired"]);
  const isOpen = (status: string) => !TERMINAL.has(status);
  const nowIso = new Date().toISOString();
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString();

  let wfBase = supabaseAdmin.from("workflows").select("id, workflow_type, overall_status, assigned_user_id, due_date", { count: "exact" });
  if (targetUserId) wfBase = wfBase.eq("assigned_user_id", targetUserId);
  else if (allowedUserIds) wfBase = wfBase.in("assigned_user_id", allowedUserIds);

  const { data: wfRowsRaw } = await wfBase;
  const wfRows = wfRowsRaw ?? [];
  const wfActive = wfRows.filter((w) => isOpen(w.overall_status)).length;
  const wfUnassigned = wfRows.filter((w) => !w.assigned_user_id && isOpen(w.overall_status)).length;
  const wfDue7d = wfRows.filter(
    (w) => isOpen(w.overall_status) && w.due_date && w.due_date <= in7 && w.due_date >= nowIso,
  ).length;
  const wfOverdue = wfRows.filter(
    (w) => isOpen(w.overall_status) && w.due_date && w.due_date < nowIso,
  ).length;
  const wfByType: Record<string, number> = {};
  for (const w of wfRows) {
    if (isOpen(w.overall_status)) {
      wfByType[w.workflow_type] = (wfByType[w.workflow_type] ?? 0) + 1;
    }
  }

  // ─── Assignment acceptance rollup ───────────────────────────────────
  // Count active workflow_assignments in scope and split by whether
  // the assignee has clicked Accept. Limited to open workflows so a
  // completed workflow's stale pending assignment doesn't distort the
  // "waiting to acknowledge" number.
  const openWfIds = wfRows.filter((w) => isOpen(w.overall_status)).map((w) => w.id);
  let assignmentsTotal = 0;
  let assignmentsAccepted = 0;
  if (openWfIds.length > 0) {
    let assignQuery = supabaseAdmin
      .from("workflow_assignments")
      .select("id, user_id, accepted_at")
      .eq("active", true)
      .in("workflow_id", openWfIds);
    if (targetUserId) assignQuery = assignQuery.eq("user_id", targetUserId);
    else if (allowedUserIds) assignQuery = assignQuery.in("user_id", allowedUserIds);
    const { data: assignRows } = await assignQuery;
    for (const a of assignRows ?? []) {
      assignmentsTotal += 1;
      if (a.accepted_at) assignmentsAccepted += 1;
    }
  }
  const assignmentsPending = assignmentsTotal - assignmentsAccepted;
  const acceptRate = assignmentsTotal > 0 ? assignmentsAccepted / assignmentsTotal : 0;

  // ─── Leads ──────────────────────────────────────────────────────────
  let leadsQuery = supabaseAdmin
    .from("sales_leads")
    .select("id, status, created_at")
    .gte("created_at", since);
  if (until) leadsQuery = leadsQuery.lte("created_at", until);
  if (targetUserId) {
    leadsQuery = leadsQuery.or(`assigned_to.eq.${targetUserId},created_by.eq.${targetUserId}`);
  } else if (allowedUserIds) {
    const clauses = allowedUserIds.map((u) => `assigned_to.eq.${u},created_by.eq.${u}`).join(",");
    leadsQuery = leadsQuery.or(clauses);
  }
  const { data: leads } = await leadsQuery;
  const leadsByStatus: Record<string, number> = {};
  for (const l of leads ?? []) leadsByStatus[l.status] = (leadsByStatus[l.status] ?? 0) + 1;

  // ─── Deals ──────────────────────────────────────────────────────────
  let dealsQuery = supabaseAdmin.from("sales_deals").select("id, stage, value, created_at");
  if (targetUserId) dealsQuery = dealsQuery.eq("assigned_to", targetUserId);
  else if (allowedUserIds) dealsQuery = dealsQuery.in("assigned_to", allowedUserIds);
  const { data: allDeals } = await dealsQuery;
  const dealsInPeriod = (allDeals ?? []).filter((d) => {
    if (d.created_at < since) return false;
    if (until && d.created_at > until) return false;
    return true;
  });
  const dealsByStage: Record<string, number> = {};
  let pipelineValue = 0;
  for (const d of dealsInPeriod) {
    dealsByStage[d.stage] = (dealsByStage[d.stage] ?? 0) + 1;
    pipelineValue += Number(d.value ?? 0);
  }

  // ─── Commissions ────────────────────────────────────────────────────
  let commissionsQuery = supabaseAdmin
    .from("sales_commissions")
    .select("id, commission_amount, status, created_at")
    .gte("created_at", since);
  if (until) commissionsQuery = commissionsQuery.lte("created_at", until);
  if (targetUserId) commissionsQuery = commissionsQuery.eq("user_id", targetUserId);
  else if (allowedUserIds) commissionsQuery = commissionsQuery.in("user_id", allowedUserIds);
  const { data: commissions } = await commissionsQuery;
  let commissionTotal = 0, commissionPending = 0, commissionApproved = 0, commissionPaid = 0;
  for (const c of commissions ?? []) {
    const amt = Number(c.commission_amount ?? 0);
    commissionTotal += amt;
    if (c.status === "pending") commissionPending += amt;
    else if (c.status === "approved") commissionApproved += amt;
    else if (c.status === "paid") commissionPaid += amt;
  }

  return NextResponse.json({
    period: { since, until, label: periodLabel(period) },
    scope: {
      user_id: filterUserId,
      market_id: marketId,
      is_company_wide: companyWide,
      viewer_role: user.role,
    },
    quotes: {
      sent: quoteRows.length,
      outstanding: outstandingQuotes,
      converted: quotesConverted,           // quote → any order (attribution)
      closed: quotesClosed,                 // quote → completed OR paid order (close rate numerator)
      total_value: quoteTotalValue,
      close_rate: closeRate,                // closed-from-quote / quotes_sent
      // Diagnostic — visible only when explicitly requested with
      // ?debug=1 so we can see WHY close rate is what it is when it
      // reads unexpectedly (missing account/deal/lead links, etc.).
      ...(url.searchParams.get("debug") === "1"
        ? {
            debug: {
              quotes_have_deal_id: q2.filter((q) => q.deal_id).length,
              quotes_have_account_id: q2.filter((q) => q.account_id).length,
              quotes_have_lead_id: q2.filter((q) => q.lead_id).length,
              // Sample the first 3 quotes so we can eyeball their fields.
              sample_quotes: q2.slice(0, 3).map((q) => ({
                id: q.id,
                deal_id: q.deal_id,
                account_id: q.account_id,
                lead_id: q.lead_id,
                created_at: q.created_at,
              })),
            },
          }
        : {}),
    },
    orders: {
      placed: orderRows.length,
      completed: ordersCompleted,
      outstanding: outstandingOrders,
      revenue: orderRevenue,
    },
    agreements: {
      crm_sent: crmSent,
      crm_awaiting: crmAwaiting,
      crm_signed: crmSigned,
      provider_sent: providerSent,
      provider_awaiting: providerAwaiting,
      provider_signed: providerSigned,
      provider_included: includeProviderAgreements,
    },
    workflows: {
      active: wfActive,
      unassigned: wfUnassigned,
      due_7d: wfDue7d,
      overdue: wfOverdue,
      by_type: wfByType,
    },
    assignments: {
      total: assignmentsTotal,
      accepted: assignmentsAccepted,
      pending: assignmentsPending,
      accept_rate: acceptRate,
    },
    leads: { total: (leads ?? []).length, by_status: leadsByStatus },
    deals: { total: dealsInPeriod.length, pipeline_value: pipelineValue, in_stage: dealsByStage },
    commissions: {
      total: commissionTotal,
      pending: commissionPending,
      approved: commissionApproved,
      paid: commissionPaid,
    },
  });
}
