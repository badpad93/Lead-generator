"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Clock,
  ArrowRight,
  Search,
  PlusCircle,
  List,
  Filter,
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

const STATUS_FILTERS = ["all", "queued", "running", "done", "failed"] as const;

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
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

  const filteredRuns = runs.filter((run) => {
    if (statusFilter !== "all" && run.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        run.city.toLowerCase().includes(q) ||
        run.state.toLowerCase().includes(q) ||
        run.industries.some((i) => i.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const statusCounts = {
    all: runs.length,
    queued: runs.filter((r) => r.status === "queued").length,
    running: runs.filter((r) => r.status === "running").length,
    done: runs.filter((r) => r.status === "done").length,
    failed: runs.filter((r) => r.status === "failed").length,
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All Runs</h1>
          <p className="text-sm text-slate-500 mt-1">
            {runs.length} total runs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusCounts.running + statusCounts.queued > 0 && (
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

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Status tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                  statusFilter === s
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {s}
                <span className="ml-1 text-slate-400">
                  {statusCounts[s as keyof typeof statusCounts]}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by city, state, or industry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Runs Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="skeleton h-5 w-32 mb-3" />
              <div className="skeleton h-3 w-48 mb-2" />
              <div className="skeleton h-3 w-24 mb-4" />
              <div className="skeleton h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {searchQuery || statusFilter !== "all" ? (
              <Filter className="w-6 h-6 text-slate-400" />
            ) : (
              <List className="w-6 h-6 text-slate-400" />
            )}
          </div>
          <h3 className="text-sm font-medium text-slate-900 mb-1">
            {searchQuery || statusFilter !== "all"
              ? "No matching runs"
              : "No runs yet"}
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            {searchQuery || statusFilter !== "all"
              ? "Try adjusting your filters."
              : "Create your first lead generation run to get started."}
          </p>
          {!searchQuery && statusFilter === "all" && (
            <Link
              href="/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <PlusCircle className="w-4 h-4" />
              Create Run
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRuns.map((run) => {
            const style = STATUS_STYLES[run.status];
            const pct = run.max_leads
              ? Math.min(100, Math.round((run.progress.total / run.max_leads) * 100))
              : 0;

            return (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg hover:border-slate-300 transition-all group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm">
                        {run.city}, {run.state}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        {run.radius_miles} mi radius
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${style.bg} ${style.text}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {run.status}
                  </span>
                </div>

                {/* Industries */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {run.industries.slice(0, 3).map((ind) => (
                    <span
                      key={ind}
                      className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium"
                    >
                      {ind}
                    </span>
                  ))}
                  {run.industries.length > 3 && (
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-medium">
                      +{run.industries.length - 3} more
                    </span>
                  )}
                </div>

                {/* Progress */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium">
                      {run.progress.total} leads
                    </span>
                    <span className="text-slate-400">{pct}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        run.status === "failed"
                          ? "bg-red-400"
                          : run.status === "done"
                            ? "bg-emerald-500"
                            : "bg-blue-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    {timeAgo(run.created_at)}
                  </div>
                  <div className="flex items-center gap-2">
                    {(run.status === "running" || run.status === "queued") && (
                      <button
                        onClick={(e) => handleStop(e, run.id)}
                        disabled={stoppingId === run.id}
                        className="flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 text-red-600 rounded-md text-[11px] font-medium hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        {stoppingId === run.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Square className="w-3 h-3" />
                        )}
                        Stop
                      </button>
                    )}
                    <span className="text-xs text-blue-600 font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      View <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
