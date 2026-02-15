"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Download,
  FileSpreadsheet,
  Search,
  ExternalLink,
  Phone,
  Pencil,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Crosshair,
  Users,
  Clock,
  Loader2,
  Square,
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

interface Lead {
  id: string;
  industry: string;
  business_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website: string;
  employee_count: number | null;
  customer_count: number | null;
  decision_maker: string | null;
  contacted_date: string | null;
  notes: string | null;
  source_url: string;
  distance_miles: number | null;
  confidence: number | null;
}

const PAGE_SIZE = 50;

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; dot: string; label: string }
> = {
  queued: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    dot: "bg-slate-400",
    label: "Queued",
  },
  running: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500 animate-pulse-dot",
    label: "Running",
  },
  done: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Completed",
  },
  failed: {
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
    label: "Failed",
  },
};

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-300">--</span>;
  const pct = Math.round(value * 100);
  let color = "bg-red-100 text-red-700";
  if (value >= 0.7) color = "bg-emerald-100 text-emerald-700";
  else if (value >= 0.4) color = "bg-amber-100 text-amber-700";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>
      {pct}%
    </span>
  );
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;

  const [run, setRun] = useState<Run | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editDate, setEditDate] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRun = useCallback(async () => {
    const res = await fetch(`/api/runs/${runId}`);
    if (res.ok) {
      const data = await res.json();
      setRun(data);
      return data.status;
    }
    return null;
  }, [runId]);

  const fetchLeads = useCallback(async () => {
    const p = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (search) p.set("search", search);

    const res = await fetch(`/api/runs/${runId}/leads?${p}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads);
      setTotal(data.total);
    }
  }, [runId, page, search]);

  useEffect(() => {
    (async () => {
      await fetchRun();
      await fetchLeads();
      setLoading(false);
    })();
  }, [fetchRun, fetchLeads]);

  useEffect(() => {
    if (run?.status === "running" || run?.status === "queued") {
      pollRef.current = setInterval(async () => {
        const status = await fetchRun();
        await fetchLeads();
        if (status === "done" || status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 4000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [run?.status, fetchRun, fetchLeads]);

  async function handleStart() {
    setStarting(true);
    const res = await fetch(`/api/runs/${runId}/start`, { method: "POST" });
    if (res.ok) await fetchRun();
    setStarting(false);
  }

  async function handleStop() {
    setStopping(true);
    const res = await fetch(`/api/runs/${runId}/stop`, { method: "POST" });
    if (res.ok) {
      if (pollRef.current) clearInterval(pollRef.current);
      await fetchRun();
    }
    setStopping(false);
  }

  async function handleSaveEdit(leadId: string) {
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: editNotes || null,
        contacted_date: editDate || null,
      }),
    });
    setEditingId(null);
    await fetchLeads();
  }

  function startEdit(lead: Lead) {
    setEditingId(lead.id);
    setEditNotes(lead.notes ?? "");
    setEditDate(lead.contacted_date ?? "");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-48" />
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="skeleton h-6 w-64 mb-4" />
          <div className="skeleton h-4 w-96 mb-3" />
          <div className="skeleton h-3 w-full rounded-full" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="skeleton h-5 w-32 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Run not found</p>
        <Link
          href="/runs"
          className="text-sm text-blue-600 hover:underline mt-2 inline-block"
        >
          Back to Runs
        </Link>
      </div>
    );
  }

  const status = STATUS_CONFIG[run.status];
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pct = run.max_leads
    ? Math.min(100, Math.round((run.progress.total / run.max_leads) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/runs"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Runs
      </Link>

      {/* Run Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-slate-900">
                  {run.city}, {run.state}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${status.bg} ${status.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <Crosshair className="w-3.5 h-3.5" />
                  {run.radius_miles} mi radius
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  Max {run.max_leads} leads
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(run.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                {run.id.slice(0, 8)}...
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {run.status === "queued" && (
              <button
                onClick={handleStart}
                disabled={starting}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {starting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {starting ? "Starting..." : "Start Run"}
              </button>
            )}
            {(run.status === "running" || run.status === "queued") && (
              <button
                onClick={handleStop}
                disabled={stopping}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {stopping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {stopping ? "Stopping..." : "Stop Run"}
              </button>
            )}
            {(run.status === "done" || run.progress.total > 0) && (
              <>
                <a
                  href={`/api/runs/${run.id}/export.csv`}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </a>
                <a
                  href={`/api/runs/${run.id}/export.xlsx`}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel
                </a>
              </>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-semibold text-slate-900">
              {run.progress.total} leads collected
            </span>
            <span className="text-slate-500">{pct}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                run.status === "failed"
                  ? "bg-red-400"
                  : run.status === "done"
                    ? "bg-emerald-500"
                    : "bg-blue-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">{run.progress.message}</p>
        </div>
      </div>

      {/* Industries */}
      <div className="flex flex-wrap gap-2">
        {run.industries.map((ind) => (
          <span
            key={ind}
            className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium border border-blue-100"
          >
            {ind}
          </span>
        ))}
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Leads
            <span className="ml-2 px-2 py-0.5 bg-slate-100 rounded-full text-xs font-medium text-slate-600">
              {total}
            </span>
          </h2>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search leads..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pl-9 text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Industry</th>
                <th>Location</th>
                <th>Phone</th>
                <th>Website</th>
                <th>Distance</th>
                <th>Confidence</th>
                <th>Notes / Contact</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center py-12 text-slate-400"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-8 h-8 text-slate-300" />
                      <p className="text-sm">
                        {run.status === "running"
                          ? "Leads will appear here as they are collected..."
                          : search
                            ? "No leads match your search"
                            : "No leads found"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <span className="font-medium text-slate-900 max-w-[200px] truncate block">
                        {lead.business_name || "--"}
                      </span>
                    </td>
                    <td>
                      {lead.industry ? (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-medium">
                          {lead.industry}
                        </span>
                      ) : (
                        <span className="text-slate-300">--</span>
                      )}
                    </td>
                    <td>
                      <div className="max-w-[200px]">
                        <p className="text-xs text-slate-700 truncate">
                          {lead.address || ""}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {[lead.city, lead.state, lead.zip]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                    </td>
                    <td>
                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone}`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline whitespace-nowrap"
                        >
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="text-slate-300">--</span>
                      )}
                    </td>
                    <td>
                      {lead.website ? (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline max-w-[140px] truncate"
                        >
                          {lead.website
                            .replace(/^https?:\/\/(www\.)?/, "")
                            .slice(0, 28)}
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-slate-300">--</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {lead.distance_miles != null ? (
                        <span className="text-xs text-slate-600">
                          {Number(lead.distance_miles).toFixed(1)} mi
                        </span>
                      ) : (
                        <span className="text-slate-300">--</span>
                      )}
                    </td>
                    <td>
                      <ConfidenceBadge value={lead.confidence} />
                    </td>
                    <td className="max-w-[180px]">
                      {editingId === lead.id ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Add notes..."
                            rows={2}
                            className="text-xs resize-none"
                          />
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="text-xs"
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(lead.id)}
                              className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-100"
                            >
                              <Check className="w-3 h-3" />
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="flex items-center gap-1 px-2 py-1 bg-slate-50 text-slate-500 rounded text-xs font-medium hover:bg-slate-100"
                            >
                              <X className="w-3 h-3" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs text-slate-600 truncate">
                            {lead.notes || (
                              <span className="text-slate-300 italic">
                                No notes
                              </span>
                            )}
                          </p>
                          {lead.contacted_date && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Contacted: {lead.contacted_date}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      {editingId !== lead.id && (
                        <button
                          onClick={() => startEdit(lead)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing {page * PAGE_SIZE + 1}–
              {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1.5 text-xs font-medium text-slate-700">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
