"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, DollarSign, TrendingUp, Clock, AlertTriangle, CheckCircle2, ArrowLeft, RefreshCw, MapPin, HandCoins } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Payout {
  id: string;
  submission_id: string;
  contract_id: string;
  amount: number;
  currency: string;
  status: string;
  qb_bill_id: string | null;
  qb_error: string | null;
  triggered_at: string;
  sent_at: string | null;
  paid_at: string | null;
  paid_method: string | null;
  paid_reference: string | null;
  contract: { title: string; tier: number; market_city: string | null; market_state: string | null } | null;
  submission: { business_name: string; city: string | null; state: string | null; admin_status: string; operator_status: string } | null;
}

interface Submission {
  id: string;
  contract_id: string;
  business_name: string;
  city: string | null;
  state: string | null;
  admin_status: string;
  operator_status: string;
  created_at: string;
  contract: { title: string; tier: number } | null;
}

interface Summary {
  awaiting_collection_cents: number;
  queued_cents: number;
  sent_to_qb_cents: number;
  paid_cents: number;
  failed_cents: number;
  lifetime_paid_cents: number;
  row_count: number;
}

const STATUS_STYLES: Record<string, string> = {
  awaiting_collection: "bg-orange-50 text-orange-700 border-orange-100",
  queued: "bg-amber-50 text-amber-700 border-amber-100",
  sent_to_qb: "bg-blue-50 text-blue-700 border-blue-100",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
  failed: "bg-red-50 text-red-700 border-red-100",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_collection: "Waiting on operator payment",
  queued: "Ready to bill",
  sent_to_qb: "Invoice created",
  paid: "Paid",
  failed: "Needs attention",
  cancelled: "Cancelled",
};

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PlacementEarningsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activeAcceptances, setActiveAcceptances] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("any");
  const [sinceDays, setSinceDays] = useState(365);

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      params.set("since_days", String(sinceDays));
      const res = await fetch(`/api/placement/my/earnings?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPayouts(data.payouts || []);
        setSubmissions(data.submissions || []);
        setSummary(data.summary || null);
        setActiveAcceptances(Number(data.active_acceptances) || 0);
      }
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [token, sinceDays]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/placement/earnings"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const filtered = statusFilter === "any" ? payouts : payouts.filter((p) => p.status === statusFilter);
  const pendingCents = summary
    ? summary.awaiting_collection_cents + summary.queued_cents + summary.sent_to_qb_cents
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/placement" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Placement Dashboard
      </Link>

      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HandCoins className="h-6 w-6 text-green-primary" /> My Earnings
          </h1>
          <p className="text-sm text-gray-500 mt-1">Every payout tied to your accepted submissions — pending, in-flight, and paid.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sinceDays}
            onChange={(e) => setSinceDays(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
          >
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
            <option value={3650}>All time</option>
          </select>
          <button
            onClick={load}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 cursor-pointer disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-6 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Pending payment to you</p>
          <p className="text-4xl font-bold text-emerald-800 mt-1">{summary ? fmt(pendingCents) : "…"}</p>
          <p className="text-xs text-gray-500 mt-1">Total across awaiting-collection, queued, and sent-to-QB rows in this window. Awaiting-collection means the operator hasn&apos;t paid the invoice yet.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Paid in window</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{summary ? fmt(summary.paid_cents) : "…"}</p>
        </div>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Tile
          icon={<Clock className="h-3.5 w-3.5 text-orange-600" />}
          label="Awaiting operator"
          value={summary ? fmt(summary.awaiting_collection_cents) : "…"}
          tint={summary && summary.awaiting_collection_cents > 0 ? "orange" : "gray"}
        />
        <Tile
          icon={<TrendingUp className="h-3.5 w-3.5 text-amber-600" />}
          label="Queued to bill"
          value={summary ? fmt(summary.queued_cents) : "…"}
          tint="amber"
        />
        <Tile
          icon={<DollarSign className="h-3.5 w-3.5 text-blue-600" />}
          label="Invoice created"
          value={summary ? fmt(summary.sent_to_qb_cents) : "…"}
          tint="blue"
        />
        <Tile
          icon={<AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
          label="Needs attention"
          value={summary ? fmt(summary.failed_cents) : "…"}
          tint={summary && summary.failed_cents > 0 ? "red" : "gray"}
          note={summary && summary.failed_cents > 0 ? "Admin is looking at these" : undefined}
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {[
          { key: "any", label: "All payouts" },
          { key: "awaiting_collection", label: "Awaiting operator" },
          { key: "queued", label: "Queued" },
          { key: "sent_to_qb", label: "Sent" },
          { key: "paid", label: "Paid" },
          { key: "failed", label: "Failed" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${statusFilter === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{filtered.length} payout{filtered.length === 1 ? "" : "s"} · {activeAcceptances} active contract{activeAcceptances === 1 ? "" : "s"}</span>
      </div>

      {/* Payouts table */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-6 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">No payouts in this window.</p>
            <p className="text-xs text-gray-400 mt-1">Payouts appear once an operator accepts one of your submissions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium">Contract</th>
                  <th className="text-left py-2 px-2 font-medium">Location</th>
                  <th className="text-right py-2 px-2 font-medium">Amount</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                  <th className="text-left py-2 px-2 font-medium">Timeline</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const stStyle = STATUS_STYLES[p.status] || "bg-gray-100 text-gray-500 border-gray-200";
                  return (
                    <tr key={p.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2 px-2 text-xs">
                        <p className="font-medium text-gray-900">{p.contract?.title || "—"}</p>
                        <p className="text-gray-400">Tier {p.contract?.tier || "?"}</p>
                      </td>
                      <td className="py-2 px-2 text-xs">
                        <p className="text-gray-900">{p.submission?.business_name || "—"}</p>
                        <p className="text-gray-400 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[p.submission?.city, p.submission?.state].filter(Boolean).join(", ") || "—"}
                        </p>
                      </td>
                      <td className="py-2 px-2 text-right font-semibold text-emerald-700">
                        ${Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${stStyle}`}>
                          {STATUS_LABEL[p.status] || p.status.replace(/_/g, " ")}
                        </span>
                        {p.qb_error && <p className="text-[10px] text-red-500 mt-0.5 italic max-w-xs truncate" title={p.qb_error}>{p.qb_error}</p>}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500">
                        <p>Triggered {new Date(p.triggered_at).toLocaleDateString()}</p>
                        {p.sent_at && <p className="text-gray-400">Sent {new Date(p.sent_at).toLocaleDateString()}</p>}
                        {p.paid_at && <p className="text-emerald-700 font-medium">Paid {new Date(p.paid_at).toLocaleDateString()}{p.paid_method ? ` · ${p.paid_method}` : ""}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent submission activity */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent submissions</h2>
        {submissions.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No submissions in this window.</p>
        ) : (
          <div className="space-y-1.5">
            {submissions.slice(0, 20).map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b border-gray-50 last:border-b-0 py-1.5 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{s.business_name}</p>
                  <p className="text-gray-400">{[s.city, s.state].filter(Boolean).join(", ")} · {s.contract?.title || "—"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={s.admin_status} label={`Admin: ${s.admin_status}`} />
                  {s.admin_status === "approved" && <StatusBadge status={s.operator_status} label={`Op: ${s.operator_status}`} />}
                  <span className="text-gray-400">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700",
    approved: "bg-emerald-50 text-emerald-700",
    accepted: "bg-emerald-50 text-emerald-700",
    rejected: "bg-red-50 text-red-700",
    resubmit_requested: "bg-blue-50 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status] || "bg-gray-100 text-gray-500"}`}>
      {label}
    </span>
  );
}

function Tile({ icon, label, value, tint, note }: { icon: React.ReactNode; label: string; value: string; tint: "amber" | "blue" | "red" | "orange" | "gray"; note?: string }) {
  const tints: Record<string, string> = {
    amber: "border-gray-100 bg-white text-amber-700",
    blue: "border-gray-100 bg-white text-blue-700",
    red: "border-red-200 bg-red-50 text-red-800",
    orange: "border-orange-200 bg-orange-50 text-orange-800",
    gray: "border-gray-100 bg-white text-gray-400",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tints[tint]}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 flex items-center gap-1">{icon}{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
      {note && <p className="text-[10px] text-gray-500 mt-0.5">{note}</p>}
    </div>
  );
}
