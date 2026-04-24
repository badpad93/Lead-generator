"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import {
  Loader2, Users, UserCheck, Clock, GraduationCap, UserX, TrendingUp, BarChart3, Timer,
} from "lucide-react";

interface DashboardData {
  total: number;
  interviewing: number;
  pendingReview: number;
  welcomeDocs: number;
  onboarded: number;
  completed: number;
  assignedToTraining: number;
  active: number;
  terminated: number;
  turnoverRate: number;
  stageCounts: { stage: string; count: number }[];
  byRole: { BDP: number; MARKET_LEADER: number };
  avgOnboardingDays: number;
}

export default function HiringDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/sales"); return; }
      setToken(session.access_token);
      fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.ok ? r.json() : [])
        .then((users: { id: string; role: string }[]) => {
          const me = users.find((u) => u.id === session.user.id);
          if (!me || (me.role !== "admin" && me.role !== "director_of_sales")) {
            router.push("/sales");
          } else {
            setAuthorized(true);
          }
        });
    });
  }, [router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/onboarding/dashboard", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!authorized || loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;
  if (!data) return <p className="p-6 text-gray-400">Unable to load dashboard.</p>;

  const maxStageCount = Math.max(...data.stageCounts.map((s) => s.count), 1);

  const kpis = [
    { label: "Total Candidates", value: data.total, icon: Users, color: "text-gray-900" },
    { label: "Interviewing", value: data.interviewing, icon: Clock, color: "text-blue-600" },
    { label: "Pending Review", value: data.pendingReview, icon: Clock, color: "text-amber-600" },
    { label: "Onboarded", value: data.onboarded, icon: UserCheck, color: "text-green-600" },
    { label: "In Training", value: data.assignedToTraining, icon: GraduationCap, color: "text-emerald-600" },
    { label: "Active", value: data.active, icon: TrendingUp, color: "text-green-700" },
    { label: "Terminated", value: data.terminated, icon: UserX, color: "text-red-600" },
  ];

  const stageColors: Record<string, string> = {
    Interview: "bg-blue-500",
    "Pending Review": "bg-amber-500",
    "Welcome Docs": "bg-purple-500",
    Completed: "bg-green-500",
    Training: "bg-emerald-500",
    Terminated: "bg-red-500",
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 className="h-6 w-6 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">Hiring & Onboarding</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-xs text-gray-500">{kpi.label}</span>
            </div>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Turnover & Metrics */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Key Metrics</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">Turnover Rate</span>
                <span className={`text-sm font-bold ${data.turnoverRate > 30 ? "text-red-600" : data.turnoverRate > 15 ? "text-amber-600" : "text-green-600"}`}>
                  {data.turnoverRate}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div
                  className={`h-2 rounded-full ${data.turnoverRate > 30 ? "bg-red-500" : data.turnoverRate > 15 ? "bg-amber-500" : "bg-green-500"}`}
                  style={{ width: `${Math.min(data.turnoverRate, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">terminated / (onboarded + terminated)</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Avg Onboarding Duration</p>
                <div className="flex items-center gap-1 mt-1">
                  <Timer className="h-4 w-4 text-green-600" />
                  <span className="text-lg font-bold text-gray-900">{data.avgOnboardingDays}</span>
                  <span className="text-xs text-gray-500">days</span>
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">By Role</p>
                <div className="flex gap-3 mt-1">
                  <div>
                    <span className="text-lg font-bold text-gray-900">{data.byRole.BDP}</span>
                    <span className="text-xs text-gray-500 ml-1">BDP</span>
                  </div>
                  <div>
                    <span className="text-lg font-bold text-gray-900">{data.byRole.MARKET_LEADER}</span>
                    <span className="text-xs text-gray-500 ml-1">ML</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Candidates by Stage */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Candidates by Stage</h2>
          <div className="space-y-3">
            {data.stageCounts.map((s) => (
              <div key={s.stage}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">{s.stage}</span>
                  <span className="text-xs font-medium text-gray-900">{s.count}</span>
                </div>
                <div className="h-6 rounded bg-gray-100">
                  <div
                    className={`h-6 rounded flex items-center px-2 text-xs font-medium text-white ${stageColors[s.stage] || "bg-gray-400"}`}
                    style={{ width: `${Math.max((s.count / maxStageCount) * 100, s.count > 0 ? 10 : 0)}%` }}
                  >
                    {s.count > 0 ? s.count : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-3xl font-bold text-green-700">{data.onboarded}</p>
          <p className="text-sm text-green-600">Successfully Onboarded</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-3xl font-bold text-red-600">{data.terminated}</p>
          <p className="text-sm text-red-500">Terminated</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <p className="text-3xl font-bold text-gray-900">{data.active}</p>
          <p className="text-sm text-gray-500">Currently Active</p>
        </div>
      </div>
    </div>
  );
}
