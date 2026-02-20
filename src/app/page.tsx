"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Users,
  BarChart3,
  Target,
  ArrowRight,
  PlusCircle,
  Clock,
  MapPin,
  Square,
  Loader2,
} from "lucide-react";

interface Run {
  id: string;
  city: string;
  state: string;
  radius_miles: number;
  max_leads: number;
  industries: string[];
  status: "queued" | "running" | "done" | "failed";
  progress: { total: number; message: string };
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  queued: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" },
  running: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500 animate-pulse-dot" },
  done: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  failed: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
};

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [stoppingAll, setStoppingAll] = useState(false);

  function fetchRuns() {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((data) => {
        setRuns(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    fetchRuns();
  }, []);

  async function handleStop(e: React.MouseEvent, runId: string) {
    e.preventDefault();
    e.stopPropagation();
    setStoppingId(runId);
    const res = await fetch(`/api/runs/${runId}/stop`, { method: "POST" });
    if (res.ok) fetchRuns();
    setStoppingId(null);
  }

  async function handleStopAll() {
    if (!confirm("Stop ALL running and queued runs?")) return;
    setStoppingAll(true);
    const res = await fetch("/api/runs/stop-all", { method: "POST" });
    if (res.ok) fetchRuns();
    setStoppingAll(false);
  }

  const totalRuns = runs.length;
  const activeRuns = runs.filter((r) => r.status === "running").length;
  const totalLeads = runs.reduce((sum, r) => sum + (r.progress?.total || 0), 0);
  const completedRuns = runs.filter((r) => r.status === "done");
  const avgLeads =
    completedRuns.length > 0
      ? Math.round(
          completedRuns.reduce((s, r) => s + (r.progress?.total || 0), 0) /
            completedRuns.length
        )
      : 0;

  const recentRuns = runs.slice(0, 8);

  const stats = [
    {
      label: "Total Runs",
      value: totalRuns,
      icon: BarChart3,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Active Runs",
      value: activeRuns,
      icon: Activity,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Total Leads",
      value: totalLeads.toLocaleString(),
      icon: Users,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      label: "Avg Leads/Run",
      value: avgLeads,
      icon: Target,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Overview of your lead generation activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeRuns > 0 && (
            <button
              onClick={handleStopAll}
              disabled={stoppingAll}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {stoppingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {stoppingAll ? "Stopping..." : "Stop All Runs"}
            </button>
          )}
          <Link
            href="/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            New Run
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="skeleton h-4 w-24 mb-3" />
              <div className="skeleton h-8 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {stat.label}
                  </span>
                  <div className={`p-2 rounded-lg ${stat.bg}`}>
                    <Icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Runs */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Recent Runs</h2>
          <Link
            href="/runs"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="skeleton h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-40" />
                  <div className="skeleton h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : recentRuns.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-medium text-slate-900 mb-1">No runs yet</h3>
            <p className="text-sm text-slate-500 mb-4">
              Create your first lead generation run to get started.
            </p>
            <Link
              href="/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <PlusCircle className="w-4 h-4" />
              Create Run
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentRuns.map((run) => {
              const style = STATUS_STYLES[run.status];
              const pct = run.max_leads
                ? Math.min(100, Math.round((run.progress.total / run.max_leads) * 100))
                : 0;

              return (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group"
                >
                  {/* Location icon */}
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <MapPin className="w-4.5 h-4.5 text-blue-600" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-slate-900">
                        {run.city}, {run.state}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${style.bg} ${style.text}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {run.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{run.industries.length} industries</span>
                      <span>{run.radius_miles} mi radius</span>
                      <span>{run.progress.total} leads</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-28 shrink-0 hidden sm:block">
                    <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          run.status === "failed" ? "bg-red-400" : "bg-blue-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Stop button for active runs */}
                  {(run.status === "running" || run.status === "queued") && (
                    <button
                      onClick={(e) => handleStop(e, run.id)}
                      disabled={stoppingId === run.id}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50 transition-colors shrink-0"
                    >
                      {stoppingId === run.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                      Stop
                    </button>
                  )}

                  {/* Time */}
                  <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                    <Clock className="w-3 h-3" />
                    {timeAgo(run.created_at)}
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
