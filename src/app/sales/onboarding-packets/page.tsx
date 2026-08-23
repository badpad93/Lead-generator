"use client";

/**
 * /sales/onboarding-packets
 *
 * One-click CRM surface for every contractor onboarding packet.
 * Reads the existing GET /api/admin/contractor-onboarding endpoint
 * so nothing new lives on the server side — this is a listing UI
 * for records that were previously only reachable by clicking the
 * emailed invitation link (or by navigating Team -> status pill).
 *
 * Each row links to the existing detail page at
 * /sales/team/contractor-onboarding/[id] where the admin can view
 * the packet, download signed documents, resend the invitation,
 * or revoke access.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import {
  ClipboardCheck,
  Search,
  Loader2,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Mail,
  Eye,
} from "lucide-react";

type OnboardingStatus =
  | "not_started"
  | "sent"
  | "opened"
  | "in_progress"
  | "completed"
  | "needs_attention"
  | "revoked"
  | "expired";

type Packet = {
  id: string;
  team_member_id: string | null;
  contractor_name: string | null;
  contractor_email: string;
  start_date: string | null;
  status: OnboardingStatus;
  sent_at: string | null;
  first_opened_at: string | null;
  completed_at: string | null;
  locked: boolean | null;
  send_count: number | null;
  created_at: string;
};

const STATUS_STYLE: Record<
  OnboardingStatus,
  { label: string; className: string; icon: typeof Clock }
> = {
  not_started: { label: "Not Started", className: "bg-gray-100 text-gray-600 ring-gray-200", icon: Clock },
  sent:        { label: "Sent",        className: "bg-blue-50 text-blue-700 ring-blue-200",   icon: Mail },
  opened:      { label: "Opened",      className: "bg-sky-50 text-sky-700 ring-sky-200",       icon: Eye },
  in_progress: { label: "In Progress", className: "bg-indigo-50 text-indigo-700 ring-indigo-200", icon: Clock },
  completed:   { label: "Completed",   className: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 },
  needs_attention: { label: "Needs Attention", className: "bg-amber-50 text-amber-700 ring-amber-200", icon: AlertTriangle },
  revoked:     { label: "Revoked",     className: "bg-gray-100 text-gray-500 line-through ring-gray-200", icon: Ban },
  expired:     { label: "Expired",     className: "bg-gray-100 text-gray-500 ring-gray-200",   icon: Clock },
};

const STATUS_ORDER: OnboardingStatus[] = [
  "needs_attention",
  "in_progress",
  "opened",
  "sent",
  "not_started",
  "completed",
  "revoked",
  "expired",
];

export default function OnboardingPacketsPage() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | OnboardingStatus>("");
  const [nowMs, setNowMs] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Sign in required.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/admin/contractor-onboarding", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 403) {
        setError("You don't have permission to view onboarding packets.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Failed to load packets (${res.status})`);
        setLoading(false);
        return;
      }
      const json = await res.json();
      setPackets((json.onboardings ?? []) as Packet[]);
      setNowMs(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packets
      .filter((p) => {
        if (statusFilter && p.status !== statusFilter) return false;
        if (!q) return true;
        return (
          (p.contractor_name ?? "").toLowerCase().includes(q) ||
          p.contractor_email.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Group: needs-attention/active up top, completed/revoked at the bottom.
        const ai = STATUS_ORDER.indexOf(a.status);
        const bi = STATUS_ORDER.indexOf(b.status);
        if (ai !== bi) return ai - bi;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [packets, search, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      total: packets.length,
      in_flight: 0,
      completed: 0,
      needs_attention: 0,
    };
    for (const p of packets) {
      if (p.status === "sent" || p.status === "opened" || p.status === "in_progress") c.in_flight += 1;
      if (p.status === "completed") c.completed += 1;
      if (p.status === "needs_attention") c.needs_attention += 1;
    }
    return c;
  }, [packets]);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-green-primary" />
            <h1 className="text-2xl font-semibold text-gray-900">Onboarding Packets</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Every contractor onboarding packet in one place — no more digging through inboxes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <MetricPill label="Total" value={counts.total} />
          <MetricPill label="In Flight" value={counts.in_flight} tone="info" />
          <MetricPill label="Completed" value={counts.completed} tone="success" />
          {counts.needs_attention > 0 && (
            <MetricPill label="Needs Attention" value={counts.needs_attention} tone="warn" />
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | OnboardingStatus)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="not_started">Not Started</option>
          <option value="sent">Sent</option>
          <option value="opened">Opened</option>
          <option value="in_progress">In Progress</option>
          <option value="needs_attention">Needs Attention</option>
          <option value="completed">Completed</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
        </select>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:border-green-primary hover:text-green-primary"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Contractor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Start Date</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">First Opened</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  <Loader2 className="inline-block h-5 w-5 animate-spin mr-2" />
                  Loading packets…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  <ClipboardCheck className="inline-block h-5 w-5 mr-2 text-gray-400" />
                  {packets.length === 0
                    ? "No onboarding packets have been sent yet."
                    : "No packets match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const style = STATUS_STYLE[p.status] ?? STATUS_STYLE.not_started;
                const StatusIcon = style.icon;
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {p.contractor_name || <span className="italic text-gray-400">Name not set</span>}
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-[240px]">
                        {p.contractor_email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${style.className}`}>
                        <StatusIcon className="h-3 w-3" />
                        {style.label}
                      </span>
                      {p.locked && (
                        <span className="ml-1 text-[10px] font-semibold uppercase text-amber-600">Locked</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{fmtDate(p.start_date)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtRel(p.sent_at, nowMs)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtRel(p.first_opened_at, nowMs)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtRel(p.completed_at, nowMs)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/sales/team/contractor-onboarding/${p.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-green-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-hover"
                      >
                        View
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricPill({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "info" | "success" | "warn" }) {
  const cls =
    tone === "warn"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : tone === "success"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : tone === "info"
          ? "bg-sky-50 text-sky-700 border-sky-200"
          : "bg-gray-50 text-gray-700 border-gray-200";
  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${cls}`}>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtRel(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const ref = nowMs === 0 ? new Date(iso).getTime() : nowMs;
  const ms = ref - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
