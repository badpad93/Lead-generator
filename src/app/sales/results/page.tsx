"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  TrendingUp,
  Target,
  DollarSign,
  Loader2,
  Calendar,
  Users,
  Save,
} from "lucide-react";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "ytd" | "custom";

interface ResultsMetrics {
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
}

interface ResultsResponse {
  period: string;
  user_id: string;
  market_id: string | null;
  metrics: ResultsMetrics;
  goal: {
    period: string;
    target_revenue: number;
    target_deals: number;
    target_leads: number;
  } | null;
}

interface SalesUserOption {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

interface Market {
  id: string;
  name: string;
  market_members: { user_id: string }[];
  market_leaders: { user_id: string }[];
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

export default function SalesResultsPage() {
  const [token, setToken] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [period, setPeriod] = useState<Period>("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterMarketId, setFilterMarketId] = useState("");
  const [salesUsers, setSalesUsers] = useState<SalesUserOption[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Goal setting state
  const [goalForm, setGoalForm] = useState({ target_revenue: "", target_deals: "", target_leads: "" });
  const [savingGoal, setSavingGoal] = useState(false);

  const isElevated = userRole === "admin" || userRole === "director_of_sales" || userRole === "market_leader";
  const canViewTeam = isElevated;
  const canSetGoals = isElevated;

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
        setCurrentUserId(session.user.id);
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
        const me = users.find((u: SalesUserOption) => u.id === currentUserId);
        if (me) setUserRole(me.role);
      });

    fetch("/api/sales/markets", { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((data: Market[]) => setMarkets(data));
  }, [token, currentUserId]);

  const load = useCallback(async () => {
    if (!token) return;
    if (period === "custom" && !startDate) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };

    let url = `/api/sales/results?period=${period}`;
    if (period === "custom" && startDate) {
      url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
    }
    if (filterUserId) url += `&user_id=${filterUserId}`;
    if (filterMarketId) url += `&market_id=${filterMarketId}`;

    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      setResults(data);
      if (data.goal) {
        setGoalForm({
          target_revenue: String(data.goal.target_revenue),
          target_deals: String(data.goal.target_deals),
          target_leads: String(data.goal.target_leads),
        });
      } else {
        setGoalForm({ target_revenue: "", target_deals: "", target_leads: "" });
      }
    }
    setLoading(false);
  }, [token, period, startDate, endDate, filterUserId, filterMarketId]);

  useEffect(() => { load(); }, [load]);

  async function saveGoal() {
    if (!filterUserId) return;
    setSavingGoal(true);
    const goalPeriod = period === "ytd" ? "yearly" : period === "custom" ? "yearly" : period;
    await fetch("/api/sales/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        user_id: filterUserId,
        period: goalPeriod,
        target_revenue: Number(goalForm.target_revenue) || 0,
        target_deals: Number(goalForm.target_deals) || 0,
        target_leads: Number(goalForm.target_leads) || 0,
      }),
    });
    setSavingGoal(false);
    load();
  }

  // Filter visible reps based on selected market
  const visibleUsers = filterMarketId
    ? salesUsers.filter((u) => {
        const market = markets.find((m) => m.id === filterMarketId);
        return market?.market_members.some((mm) => mm.user_id === u.id);
      })
    : salesUsers;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header + Filters */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900">Sales Results</h1>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          {canViewTeam && markets.length > 0 && (
            <select
              value={filterMarketId}
              onChange={(e) => {
                setFilterMarketId(e.target.value);
                setFilterUserId("");
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
            >
              <option value="">All Markets</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}

          {canViewTeam && (
            <select
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
            >
              <option value="">All Reps</option>
              {visibleUsers.filter((u) => u.role === "sales").map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
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

        {period === "custom" && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            <span className="text-sm text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      ) : results ? (
        <div className="space-y-6">
          {/* Context label */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Users className="h-4 w-4" />
            <span>
              Viewing: {filterUserId
                ? salesUsers.find((u) => u.id === filterUserId)?.full_name || "Rep"
                : filterMarketId
                  ? markets.find((m) => m.id === filterMarketId)?.name || "Market"
                  : isElevated ? "All Reps (Organization)" : "Your Results"
              }
              {" — "}
              {period === "custom"
                ? `${startDate || "..."} to ${endDate || "now"}`
                : PERIODS.find((p) => p.value === period)?.label}
            </span>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs text-gray-500">Leads Worked</p>
              <p className="text-2xl font-bold text-gray-900">{results.metrics.leads_total}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs text-gray-500">Deals Won</p>
              <p className="text-2xl font-bold text-gray-900">{results.metrics.deals_won}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs text-gray-500">Won Revenue</p>
              <p className="text-2xl font-bold text-green-600">{fmt(results.metrics.won_value)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs text-gray-500">Pipeline</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(results.metrics.pipeline_value)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs text-gray-500">Orders Sent</p>
              <p className="text-2xl font-bold text-gray-900">{results.metrics.orders_total}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs text-gray-500">Order Revenue</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(results.metrics.order_revenue)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs text-gray-500">Close Rate</p>
              <p className="text-2xl font-bold text-green-600">
                {(results.metrics.conversion_rate * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs text-gray-500">Completed Orders</p>
              <p className="text-2xl font-bold text-gray-900">{results.metrics.orders_completed}</p>
            </div>
          </div>

          {/* Lead status breakdown */}
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(results.metrics.leads_by_status).map(([k, v]) => (
              <span key={k} className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                <span className="capitalize">{k}</span>: <strong>{v}</strong>
              </span>
            ))}
          </div>

          {/* Deal stage breakdown */}
          {Object.keys(results.metrics.deals_by_stage).length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Deals by Stage</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(results.metrics.deals_by_stage).map(([stage, count]) => (
                  <div key={stage} className="rounded-lg bg-gray-50 px-4 py-2 text-center">
                    <p className="text-lg font-bold text-gray-900">{count}</p>
                    <p className="text-xs text-gray-500 capitalize">{stage}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Goal progress */}
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
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No goal set for this period.{canSetGoals && filterUserId ? " Set one below." : ""}
              </p>
            )}
          </div>

          {/* Goal setting (admin/DOS only, when viewing a specific rep) */}
          {canSetGoals && filterUserId && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Set Goal — {period === "ytd" ? "Yearly" : period === "custom" ? "Yearly" : period.charAt(0).toUpperCase() + period.slice(1)}
                {" for "}
                {salesUsers.find((u) => u.id === filterUserId)?.full_name || "Rep"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Revenue Target ($)</label>
                  <input
                    type="number"
                    value={goalForm.target_revenue}
                    onChange={(e) => setGoalForm((f) => ({ ...f, target_revenue: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Deals Target</label>
                  <input
                    type="number"
                    value={goalForm.target_deals}
                    onChange={(e) => setGoalForm((f) => ({ ...f, target_deals: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Leads Target</label>
                  <input
                    type="number"
                    value={goalForm.target_leads}
                    onChange={(e) => setGoalForm((f) => ({ ...f, target_leads: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={saveGoal}
                disabled={savingGoal}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                <Save className="h-4 w-4" />
                {savingGoal ? "Saving..." : "Save Goal"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-gray-400 text-center py-12">No results to display.</p>
      )}
    </div>
  );
}
