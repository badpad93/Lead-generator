"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  Users,
  Kanban,
  Building2,
  ClipboardList,
  Loader2,
  TrendingUp,
  Target,
  DollarSign,
  Link2,
  Copy,
  Check,
  Calendar,
  FileText,
  ScrollText,
  Workflow,
  Package,
  MapPin,
  Coffee,
  Globe,
} from "lucide-react";
import Link from "next/link";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "ytd" | "custom";

interface ResultsResponse {
  period: string;
  metrics: {
    leads_total: number;
    leads_by_status: Record<string, number>;
    deals_total: number;
    deals_by_stage: Record<string, number>;
    deals_won: number;
    pipeline_value: number;
    won_value: number;
    orders_total: number;
    orders_completed: number;
    order_revenue: number;
    conversion_rate: number;
    commission_total: number;
    commission_pending: number;
    commission_approved: number;
    commission_paid: number;
  };
  goal: {
    period: string;
    target_revenue: number;
    target_deals: number;
    target_leads: number;
    target_commission: number;
  } | null;
}

interface SnapshotResponse {
  period: { since: string; until: string | null; label: string };
  scope: { user_id: string | null; market_id: string | null; is_company_wide: boolean; viewer_role: string };
  quotes: { sent: number; outstanding: number; converted: number; total_value: number };
  orders: { placed: number; completed: number; outstanding: number; revenue: number };
  agreements: {
    crm_sent: number; crm_awaiting: number; crm_signed: number;
    provider_sent: number; provider_awaiting: number; provider_signed: number;
    provider_included: boolean;
  };
  workflows: { active: number; unassigned: number; due_7d: number; overdue: number; by_type: Record<string, number> };
  leads: { total: number; by_status: Record<string, number> };
  deals: { total: number; pipeline_value: number; in_stage: Record<string, number> };
  commissions: { total: number; pending: number; approved: number; paid: number };
}

interface SalesUserOption {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "quarterly", label: "This Quarter" },
  { value: "ytd", label: "YTD" },
  { value: "yearly", label: "Year" },
  { value: "custom", label: "Custom Range" },
];

function fmt(n: number) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function ProgressBar({ value, target, label }: { value: number; target: number; label: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span>{value} / {target}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full ${pct >= 100 ? "bg-green-500" : "bg-green-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function SalesDashboard() {
  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [copied, setCopied] = useState(false);
  const [period, setPeriod] = useState<Period>("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [salesUsers, setSalesUsers] = useState<SalesUserOption[]>([]);
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [counts, setCounts] = useState({ leads: 0, deals: 0, accounts: 0, orders: 0 });
  const [loading, setLoading] = useState(true);

  const isElevated = userRole === "admin" || userRole === "director_of_sales" || userRole === "market_leader";

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
        setUserId(session.user.id);
      }
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    fetch("/api/sales/users", { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((users: SalesUserOption[]) => {
        setSalesUsers(users);
        const me = users.find((u: SalesUserOption) => u.id === userId);
        if (me) setUserRole(me.role);
      });
  }, [token, userId]);

  useEffect(() => {
    async function load() {
      if (!token) return;
      if (period === "custom" && !startDate) return;
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      let resultsUrl = `/api/sales/results?period=${period}`;
      let snapshotUrl = `/api/sales/executive-snapshot?period=${period}`;
      if (period === "custom" && startDate) {
        const qs = `&start_date=${startDate}${endDate ? `&end_date=${endDate}` : ""}`;
        resultsUrl += qs;
        snapshotUrl += qs;
      }
      if (filterUserId) {
        resultsUrl += `&user_id=${filterUserId}`;
        snapshotUrl += `&user_id=${filterUserId}`;
      }

      const [resultsRes, snapshotRes, leadsRes, dealsRes, accountsRes, ordersRes] = await Promise.all([
        fetch(resultsUrl, { headers }),
        fetch(snapshotUrl, { headers }),
        fetch("/api/sales/leads", { headers }),
        fetch("/api/sales/deals", { headers }),
        fetch("/api/sales/accounts", { headers }),
        fetch("/api/sales/orders", { headers }),
      ]);
      if (resultsRes.ok) setResults(await resultsRes.json());
      if (snapshotRes.ok) setSnapshot(await snapshotRes.json());
      const [leads, deals, accounts, orders] = await Promise.all([
        leadsRes.ok ? leadsRes.json() : [],
        dealsRes.ok ? dealsRes.json() : [],
        accountsRes.ok ? accountsRes.json() : [],
        ordersRes.ok ? ordersRes.json() : [],
      ]);
      setCounts({
        leads: leads.length,
        deals: deals.length,
        accounts: accounts.length,
        orders: orders.length,
      });
      setLoading(false);
    }
    load();
  }, [token, period, startDate, endDate, filterUserId]);

  const cards = [
    { label: "Leads", value: counts.leads, icon: Users, href: "/sales/leads", color: "text-blue-600 bg-blue-50" },
    { label: "Deals", value: counts.deals, icon: Kanban, href: "/sales/deals", color: "text-green-600 bg-green-50" },
    { label: "Accounts", value: counts.accounts, icon: Building2, href: "/sales/accounts", color: "text-purple-600 bg-purple-50" },
    { label: "Orders", value: counts.orders, icon: ClipboardList, href: "/sales/orders", color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <div className="p-6">
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <div className="flex items-center gap-2">
            {isElevated && (
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
              >
                <option value="">All Reps</option>
                {salesUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </select>
            )}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2 self-end">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              placeholder="Start date"
            />
            <span className="text-sm text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              placeholder="End date"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Referral link for commission tracking */}
          {userId && (
            <div className="rounded-xl border border-green-200 bg-green-50/50 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700">
                  <Link2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">Your Referral Link</h3>
                  <p className="mt-0.5 text-xs text-gray-600">
                    Share this link — any leads submitted through it are attributed to you for commission tracking.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      readOnly
                      value={typeof window !== "undefined" ? `${window.location.origin}/request-location?ref=${userId}` : ""}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:border-green-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const link = `${window.location.origin}/request-location?ref=${userId}`;
                        navigator.clipboard.writeText(link);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 cursor-pointer"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Executive Snapshot — quotes / orders / agreements / workflows */}
          {snapshot && <ExecutiveSnapshot data={snapshot} />}

          {/* Totals */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{card.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {results && (
            <>
              {/* Period results */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <h2 className="text-base font-semibold text-gray-900">
                    Results — {period === "custom" ? `${startDate || "..."} to ${endDate || "now"}` : PERIODS.find((p) => p.value === period)?.label}
                    {isElevated && (
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        {filterUserId ? salesUsers.find((u) => u.id === filterUserId)?.full_name || "Rep" : "All Reps"}
                      </span>
                    )}
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Leads Worked</p>
                    <p className="text-xl font-bold text-gray-900">{results.metrics.leads_total}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Deals Won</p>
                    <p className="text-xl font-bold text-gray-900">{results.metrics.deals_won}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Won Revenue</p>
                    <p className="text-xl font-bold text-green-600">{fmt(results.metrics.won_value)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Pipeline</p>
                    <p className="text-xl font-bold text-gray-900">{fmt(results.metrics.pipeline_value)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Orders Sent</p>
                    <p className="text-xl font-bold text-gray-900">{results.metrics.orders_total}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Order Revenue</p>
                    <p className="text-xl font-bold text-gray-900">{fmt(results.metrics.order_revenue)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Close Rate</p>
                    <p className="text-xl font-bold text-green-600">
                      {(results.metrics.conversion_rate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Completed Orders</p>
                    <p className="text-xl font-bold text-gray-900">{results.metrics.orders_completed}</p>
                  </div>
                  <div className="rounded-lg bg-green-50 p-4">
                    <p className="text-xs text-gray-500">Manual Adjustments (Total)</p>
                    <p className="text-xl font-bold text-green-600">{fmt(results.metrics.commission_total)}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-4">
                    <p className="text-xs text-gray-500">Manual Adj. — Pending</p>
                    <p className="text-xl font-bold text-amber-600">{fmt(results.metrics.commission_pending)}</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-4">
                    <p className="text-xs text-gray-500">Manual Adj. — Approved</p>
                    <p className="text-xl font-bold text-blue-600">{fmt(results.metrics.commission_approved)}</p>
                  </div>
                  <div className="rounded-lg bg-green-50 p-4">
                    <p className="text-xs text-gray-500">Manual Adj. — Paid</p>
                    <p className="text-xl font-bold text-green-700">{fmt(results.metrics.commission_paid)}</p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  &ldquo;Manual Adjustments&rdquo; = bonuses / overrides recorded on <a className="text-green-primary hover:underline" href="/sales/commissions">Commissions</a>. Auto-earn from paid orders + attribution rules lives on <a className="text-green-primary hover:underline" href="/admin/financial/commissions">Financial Center → Commissions</a>. Reps see the combined view on <a className="text-green-primary hover:underline" href="/my/commissions">My Commissions</a>.
                </p>

                {/* Lead status breakdown */}
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {Object.entries(results.metrics.leads_by_status).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                      <span className="capitalize">{k}</span>: <strong>{v}</strong>
                    </span>
                  ))}
                </div>
              </div>

              {/* Goals */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="h-5 w-5 text-green-600" />
                  <h2 className="text-base font-semibold text-gray-900">Goal Progress</h2>
                </div>
                {results.goal ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> Revenue</span>
                        <span>{fmt(results.metrics.won_value)} / {fmt(results.goal.target_revenue)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-green-500"
                          style={{
                            width: `${results.goal.target_revenue > 0 ? Math.min(100, (results.metrics.won_value / results.goal.target_revenue) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <ProgressBar value={results.metrics.deals_won} target={results.goal.target_deals} label="Deals Won" />
                    <ProgressBar value={results.metrics.leads_total} target={results.goal.target_leads} label="Leads" />
                    {results.goal.target_commission > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> Commission</span>
                          <span>{fmt(results.metrics.commission_total)} / {fmt(results.goal.target_commission)}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100">
                          <div
                            className="h-2 rounded-full bg-green-500"
                            style={{
                              width: `${Math.min(100, (results.metrics.commission_total / results.goal.target_commission) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    No goal set for this period. An admin can set goals for you.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Executive Snapshot                                                */
/*  A compact operating view: quotes/orders/agreements/workflows.     */
/*  Numerator/denominator + progress bar for each so leadership sees  */
/*  the gap at a glance. Individual reps see their own numbers;       */
/*  admin + DOS see company-wide (or filtered).                       */
/* ------------------------------------------------------------------ */
function ExecutiveSnapshot({ data }: { data: SnapshotResponse }) {
  const q = data.quotes;
  const o = data.orders;
  const a = data.agreements;
  const w = data.workflows;

  const wfTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    ai_machine_fulfillment: Package,
    location_services: MapPin,
    financing: DollarSign,
    coffee_equipment: Coffee,
    coffee_service: Coffee,
    website_build: Globe,
  };

  const wfTypeLabels: Record<string, string> = {
    ai_machine_fulfillment: "AI Machines",
    location_services: "Location Services",
    financing: "Financing",
    coffee_equipment: "Coffee Equipment",
    coffee_service: "Coffee Service",
    website_build: "Website Builds",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-green-600" />
        <h2 className="text-base font-semibold text-gray-900">
          Executive Snapshot — {data.period.label}
          <span className="ml-2 text-sm font-normal text-gray-500">
            {data.scope.is_company_wide ? "Company-wide" : data.scope.user_id ? "This rep" : "My activity"}
          </span>
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SnapshotCard
          icon={<FileText className="h-4 w-4" />}
          label="Quotes"
          primary={`${q.sent} sent`}
          numerator={q.converted}
          denominator={Math.max(q.sent, q.converted)}
          progressLabel={`${q.converted} converted`}
          rows={[
            [`Outstanding`, `${q.outstanding}`],
            [`Total quoted value`, `$${q.total_value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`],
          ]}
          tone="blue"
        />
        <SnapshotCard
          icon={<ClipboardList className="h-4 w-4" />}
          label="Orders"
          primary={`${o.placed} placed`}
          numerator={o.completed}
          denominator={Math.max(o.placed, o.completed)}
          progressLabel={`${o.completed} completed`}
          rows={[
            [`Outstanding`, `${o.outstanding}`],
            [`Revenue`, `$${o.revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`],
          ]}
          tone="orange"
        />
        <SnapshotCard
          icon={<ScrollText className="h-4 w-4" />}
          label="Agreements"
          primary={`${a.crm_sent} sent`}
          numerator={a.crm_signed}
          denominator={Math.max(a.crm_sent, a.crm_signed)}
          progressLabel={`${a.crm_signed} fully signed`}
          rows={[
            [`Awaiting signature`, `${a.crm_awaiting}`],
            ...(a.provider_included
              ? [[`Provider (PPA + coffee)`, `${a.provider_signed}/${a.provider_sent}`] as [string, string]]
              : []),
          ]}
          tone="emerald"
        />
        <SnapshotCard
          icon={<Workflow className="h-4 w-4" />}
          label="Workflows"
          primary={`${w.active} active`}
          numerator={w.active - w.overdue - w.unassigned}
          denominator={w.active}
          progressLabel={w.active === 0 ? "—" : `${w.active - w.overdue - w.unassigned} on track`}
          rows={[
            [`Overdue`, `${w.overdue}`],
            [`Unassigned`, `${w.unassigned}`],
            [`Due within 7d`, `${w.due_7d}`],
          ]}
          tone="purple"
        />
      </div>

      {/* By-type workflow breakdown (only shown when there are any) */}
      {Object.keys(w.by_type).length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span className="font-medium uppercase tracking-wide text-gray-500">Active by service:</span>
          {Object.entries(w.by_type).map(([type, count]) => {
            const Icon = wfTypeIcons[type] ?? Workflow;
            return (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1"
              >
                <Icon className="h-3 w-3" />
                {wfTypeLabels[type] ?? type} · <span className="font-semibold">{count}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SnapshotCard({
  icon,
  label,
  primary,
  numerator,
  denominator,
  progressLabel,
  rows,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  numerator: number;
  denominator: number;
  progressLabel: string;
  rows: [string, string][];
  tone: "blue" | "orange" | "emerald" | "purple";
}) {
  const pct = denominator > 0 ? Math.min(100, Math.round((numerator / denominator) * 100)) : 0;
  const toneClasses = {
    blue: { text: "text-blue-700", bg: "bg-blue-50", bar: "bg-blue-500" },
    orange: { text: "text-orange-700", bg: "bg-orange-50", bar: "bg-orange-500" },
    emerald: { text: "text-emerald-700", bg: "bg-emerald-50", bar: "bg-emerald-500" },
    purple: { text: "text-purple-700", bg: "bg-purple-50", bar: "bg-purple-500" },
  }[tone];

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-500">
        <span className={toneClasses.text}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-gray-900">{primary}</div>
      <div className="mt-2">
        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
          <span>{progressLabel}</span>
          <span>{denominator > 0 ? `${pct}%` : "—"}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div className={`h-2 rounded-full ${toneClasses.bar}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="mt-3 space-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between text-gray-600">
            <span>{k}</span>
            <span className="font-medium text-gray-900">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
