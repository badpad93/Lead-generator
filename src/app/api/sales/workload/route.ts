import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

/**
 * GET /api/sales/workload?period=<period>&start_date=<iso>&end_date=<iso>&market_id=<id>
 *
 * Per-employee workload aggregation for the /sales/workload page.
 *
 * For each staff user in scope, returns:
 *   - active workflows count (assigned as primary OR active collaborator)
 *   - by_type breakdown (ai_machine, location_services, etc.)
 *   - overdue count
 *   - due within 7d count
 *   - hours clocked in period (from time_entries)
 *   - avg time to close (days between created_at and completed_at for
 *     their closed workflows in the last 90 days)
 *   - close rate (quotes-they-sent that ended up with a completed/paid
 *     order by deal_id) in period
 *   - capacity flag (green <10 / yellow 10-20 / red >20 active)
 *
 * Scope:
 *   admin / DOS  → every sales user
 *   market_leader → their market's users
 *   sales / sales_manager → just themselves
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

const CAPACITY_GREEN_MAX = Number(process.env.WORKLOAD_CAPACITY_GREEN_MAX ?? 10);
const CAPACITY_YELLOW_MAX = Number(process.env.WORKLOAD_CAPACITY_YELLOW_MAX ?? 20);

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const period = (url.searchParams.get("period") || "monthly") as Period;
  const marketId = url.searchParams.get("market_id") || null;
  const elevated = isElevatedRole(user.role);

  // ─── Resolve who this viewer can see ──────────────────────────────
  let staffIds: string[];
  if (elevated) {
    if (marketId) {
      const { data: members } = await supabaseAdmin
        .from("market_members")
        .select("user_id")
        .eq("market_id", marketId);
      staffIds = (members ?? []).map((m) => m.user_id);
    } else {
      const { data: allStaff } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .in("role", ["admin", "director_of_sales", "market_leader", "sales_manager", "sales"]);
      staffIds = (allStaff ?? []).map((s) => s.id);
    }
  } else if (user.role === "market_leader") {
    const { data: leaderOf } = await supabaseAdmin
      .from("market_leaders")
      .select("market_id")
      .eq("user_id", user.id);
    const leaderMarketIds = (leaderOf ?? []).map((r) => r.market_id);
    if (leaderMarketIds.length === 0) {
      staffIds = [user.id];
    } else {
      const { data: members } = await supabaseAdmin
        .from("market_members")
        .select("user_id")
        .in("market_id", leaderMarketIds);
      staffIds = Array.from(new Set([user.id, ...((members ?? []).map((m) => m.user_id))]));
    }
  } else {
    staffIds = [user.id];
  }

  if (staffIds.length === 0) {
    return NextResponse.json({ period: { label: period }, employees: [] });
  }

  // ─── Period bounds ────────────────────────────────────────────────
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
  const nowIso = new Date().toISOString();
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000).toISOString();

  // ─── Profiles for name/role/email ─────────────────────────────────
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role")
    .in("id", staffIds);
  const profileMap = new Map<string, { id: string; full_name: string | null; email: string; role: string }>();
  for (const p of profiles ?? []) profileMap.set(p.id, p);

  // ─── Workflows: pull only what we need for aggregation ────────────
  // A workflow counts as "active workload" until it reaches a terminal
  // state (completed / cancelled / refunded / expired). Prior list only
  // included the seven "in flight" statuses, which excluded newly-
  // assigned workflows whose overall_status was still pending_payment,
  // draft, or on_hold — those got dropped from workload counts even
  // though the assignee still owned them.
  const TERMINAL = ["completed", "cancelled", "refunded", "expired"];
  const isOpen = (s: string) => !TERMINAL.includes(s);

  const { data: allWorkflows } = await supabaseAdmin
    .from("workflows")
    .select("id, workflow_type, overall_status, assigned_user_id, due_date, created_at, completed_at, customer_id, template_id")
    .in("assigned_user_id", staffIds);

  // Also pick up collaborator assignments (workflow_assignments).
  const { data: collaborations } = await supabaseAdmin
    .from("workflow_assignments")
    .select("workflow_id, user_id, active")
    .in("user_id", staffIds)
    .eq("active", true);

  // Build a set of (user_id, workflow_id) — includes primary + collaborator.
  const userWorkflows = new Map<string, Set<string>>();
  for (const w of allWorkflows ?? []) {
    if (!w.assigned_user_id) continue;
    if (!userWorkflows.has(w.assigned_user_id)) userWorkflows.set(w.assigned_user_id, new Set());
    userWorkflows.get(w.assigned_user_id)!.add(w.id);
  }
  for (const c of collaborations ?? []) {
    if (!userWorkflows.has(c.user_id)) userWorkflows.set(c.user_id, new Set());
    userWorkflows.get(c.user_id)!.add(c.workflow_id);
  }

  // Also need workflows for collaborator IDs — fetch missing ones.
  const knownWorkflowIds = new Set((allWorkflows ?? []).map((w) => w.id));
  const collaboratorOnlyIds = new Set<string>();
  for (const c of collaborations ?? []) {
    if (!knownWorkflowIds.has(c.workflow_id)) collaboratorOnlyIds.add(c.workflow_id);
  }
  const collaboratorWorkflows = collaboratorOnlyIds.size > 0
    ? (await supabaseAdmin
        .from("workflows")
        .select("id, workflow_type, overall_status, assigned_user_id, due_date, created_at, completed_at, customer_id, template_id")
        .in("id", Array.from(collaboratorOnlyIds))).data ?? []
    : [];
  type WorkflowSlim = {
    id: string;
    workflow_type: string;
    overall_status: string;
    assigned_user_id: string | null;
    due_date: string | null;
    created_at: string;
    completed_at: string | null;
    customer_id: string;
    template_id: string | null;
  };
  const workflowMap = new Map<string, WorkflowSlim>();
  for (const w of [...(allWorkflows ?? []), ...collaboratorWorkflows]) {
    workflowMap.set(w.id, w as WorkflowSlim);
  }

  // Fetch template weights so we can compute weighted load per user.
  // Built-in templates default to weight=1; custom templates carry the
  // admin-configured value.
  const templateIds = Array.from(new Set(
    [...(allWorkflows ?? []), ...collaboratorWorkflows]
      .map((w) => w.template_id)
      .filter(Boolean) as string[],
  ));
  const weightByTemplate = new Map<string, number>();
  if (templateIds.length > 0) {
    const { data: tmpls } = await supabaseAdmin
      .from("workflow_templates")
      .select("id, workload_weight")
      .in("id", templateIds);
    for (const t of tmpls ?? []) {
      weightByTemplate.set(t.id, Number((t as { workload_weight?: number }).workload_weight ?? 1));
    }
  }
  const weightFor = (w: WorkflowSlim): number =>
    w.template_id ? weightByTemplate.get(w.template_id) ?? 1 : 1;

  // ─── Time entries in period ───────────────────────────────────────
  let timeQuery = supabaseAdmin
    .from("time_entries")
    .select("user_id, duration_minutes")
    .in("user_id", staffIds)
    .gte("clock_in", since);
  if (until) timeQuery = timeQuery.lte("clock_in", until);
  const { data: timeEntries } = await timeQuery;
  const hoursByUser = new Map<string, number>();
  for (const t of timeEntries ?? []) {
    const mins = Number((t as { duration_minutes?: number | null }).duration_minutes ?? 0);
    hoursByUser.set(t.user_id, (hoursByUser.get(t.user_id) ?? 0) + mins);
  }

  // ─── Sales orders/quotes for close-rate ───────────────────────────
  // Pull quotes created in period for these users, then look for matching
  // closed orders (any date) via deal_id.
  const { data: quoteRows } = await supabaseAdmin
    .from("sales_orders")
    .select("id, deal_id, created_by, document_type, created_at")
    .in("created_by", staffIds)
    .eq("document_type", "quote")
    .gte("created_at", since);
  const quoteRowsList = (quoteRows ?? []) as { id: string; deal_id: string | null; created_by: string; created_at: string }[];
  const quoteDealIds = Array.from(
    new Set(quoteRowsList.map((q) => q.deal_id).filter(Boolean) as string[]),
  );
  const closedDealIds = new Set<string>();
  if (quoteDealIds.length > 0) {
    // "Closed" = strictly payment_status='paid' (matches executive
    // snapshot). Completed-but-unpaid orders do not count as closed.
    const { data: closedOrders } = await supabaseAdmin
      .from("sales_orders")
      .select("deal_id")
      .in("deal_id", quoteDealIds)
      .eq("payment_status", "paid");
    for (const r of (closedOrders ?? []) as { deal_id: string | null }[]) {
      if (r.deal_id) closedDealIds.add(r.deal_id);
    }
  }
  const quotesSentByUser = new Map<string, number>();
  const quotesClosedByUser = new Map<string, number>();
  for (const q of quoteRowsList) {
    quotesSentByUser.set(q.created_by, (quotesSentByUser.get(q.created_by) ?? 0) + 1);
    if (q.deal_id && closedDealIds.has(q.deal_id)) {
      quotesClosedByUser.set(q.created_by, (quotesClosedByUser.get(q.created_by) ?? 0) + 1);
    }
  }

  // ─── Assemble per-employee rows ───────────────────────────────────
  const employees = Array.from(profileMap.values()).map((profile) => {
    const wfIds = Array.from(userWorkflows.get(profile.id) ?? []);
    const wfs = wfIds.map((id) => workflowMap.get(id)!).filter(Boolean);
    const openWfs = wfs.filter((w) => isOpen(w.overall_status));
    const byType: Record<string, number> = {};
    for (const w of openWfs) byType[w.workflow_type] = (byType[w.workflow_type] ?? 0) + 1;
    const overdue = openWfs.filter((w) => w.due_date && w.due_date < nowIso).length;
    const due7d = openWfs.filter((w) => w.due_date && w.due_date >= nowIso && w.due_date <= in7).length;
    const closedRecently = wfs.filter(
      (w) => w.overall_status === "completed" && w.completed_at && w.completed_at >= ninetyDaysAgo,
    );
    const avgDaysToClose = closedRecently.length > 0
      ? Math.round(
          closedRecently.reduce((sum, w) => {
            const created = new Date(w.created_at).getTime();
            const done = new Date(w.completed_at!).getTime();
            return sum + Math.max(0, (done - created) / 86400_000);
          }, 0) / closedRecently.length,
        )
      : null;
    const hoursMins = hoursByUser.get(profile.id) ?? 0;
    const sentQuotes = quotesSentByUser.get(profile.id) ?? 0;
    const closedQuotes = quotesClosedByUser.get(profile.id) ?? 0;
    const closeRate = sentQuotes > 0 ? closedQuotes / sentQuotes : 0;
    const active = openWfs.length;
    // Weighted load — built-in templates contribute 1 each, custom
    // templates contribute their admin-configured weight (1-20). This
    // is what drives the capacity flag so a rep with 3 heavy accounts
    // (weight 5 each = 15) is flagged the same as one with 15 quick
    // tasks.
    const load = openWfs.reduce((sum, w) => sum + weightFor(w), 0);
    const capacity: "green" | "yellow" | "red" = load <= CAPACITY_GREEN_MAX
      ? "green"
      : load <= CAPACITY_YELLOW_MAX
        ? "yellow"
        : "red";

    return {
      user_id: profile.id,
      name: profile.full_name ?? profile.email,
      email: profile.email,
      role: profile.role,
      active,
      load,
      by_type: byType,
      overdue,
      due_7d: due7d,
      hours_period: Math.round((hoursMins / 60) * 10) / 10,
      avg_days_to_close: avgDaysToClose,
      close_rate: closeRate,
      quotes_sent: sentQuotes,
      quotes_closed: closedQuotes,
      capacity,
    };
  });

  employees.sort((a, b) => b.load - a.load);

  return NextResponse.json({
    period: { since, until, label: period },
    capacity_thresholds: { green_max: CAPACITY_GREEN_MAX, yellow_max: CAPACITY_YELLOW_MAX },
    employees,
  });
}
