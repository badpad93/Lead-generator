"use client";

import { useState, useEffect, useCallback } from "react";
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
  };
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
  const [counts, setCounts] = useState({ leads: 0, deals: 0, accounts: 0, orders: 0 });
  const [loading, setLoading] = useState(true);

  const isElevated = userRole === "admin" || userRole === "director_of_sales";

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

  const load = useCallback(async () => {
    if (!token) return;
    if (period === "custom" && !startDate) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };

    let resultsUrl = `/api/sales/results?period=${period}`;
    if (period === "custom" && startDate) {
      resultsUrl += `&start_date=${startDate}`;
      if (endDate) resultsUrl += `&end_date=${endDate}`;
    }
    if (filterUserId) resultsUrl += `&user_id=${filterUserId}`;

    const [resultsRes, leadsRes, dealsRes, accountsRes, ordersRes] = await Promise.all([
      fetch(resultsUrl, { headers }),
      fetch("/api/sales/leads", { headers }),
      fetch("/api/sales/deals", { headers }),
      fetch("/api/sales/accounts", { headers }),
      fetch("/api/sales/orders", { headers }),
    ]);
    if (resultsRes.ok) setResults(await resultsRes.json());
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
  }, [token, period, startDate, endDate, filterUserId]);

  useEffect(() => { load(); }, [load]);

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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
                </div>

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
