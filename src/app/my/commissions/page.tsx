"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, DollarSign, TrendingUp, Clock, AlertTriangle, CheckCircle2, Percent, ArrowLeft, RefreshCw } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface LedgerRow {
  id: string;
  order_id: string;
  role_code: string;
  attribution_percentage: number;
  basis_cents: number;
  rate_bps: number;
  amount_cents: number;
  hold_days: number;
  status: string;
  earned_at: string;
  clearable_at: string | null;
  paid_at: string | null;
  reversal_reason: string | null;
  order: { id: string; total_value: number | null; order_type: string | null; order_status: string; created_at: string } | null;
}

interface Summary {
  earned_cents: number;
  held_cents: number;
  reversed_cents: number;
  paid_cents: number;
  pending_clearable_cents: number;
  net_available_cents: number;
  combined_net_available_cents: number;
  clawback_pending_cents: number;
  clawback_collected_cents: number;
  clawback_waived_cents: number;
  by_role: Record<string, number>;
  row_count: number;
}

interface Adjustments {
  pending_cents: number;
  approved_unpaid_cents: number;
  paid_cents: number;
  total_cents: number;
  row_count: number;
}

const STATUS_STYLES: Record<string, string> = {
  earned: "bg-emerald-50 text-emerald-700 border-emerald-100",
  held: "bg-amber-50 text-amber-700 border-amber-100",
  paid: "bg-blue-50 text-blue-700 border-blue-100",
  reversed: "bg-red-50 text-red-700 border-red-100",
  clawback_pending: "bg-orange-50 text-orange-700 border-orange-200",
  clawback_collected: "bg-emerald-50 text-emerald-700 border-emerald-100",
  clawback_waived: "bg-gray-100 text-gray-500 border-gray-200",
};

const FILTERS = [
  { key: "any", label: "All" },
  { key: "earned", label: "Earned (open)" },
  { key: "held", label: "Held" },
  { key: "paid", label: "Paid" },
  { key: "clawback_pending", label: "Owed back" },
];

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MyCommissionsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustments | null>(null);
  const [statusFilter, setStatusFilter] = useState("any");
  const [sinceDays, setSinceDays] = useState(365);

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      params.set("since_days", String(sinceDays));
      const res = await fetch(`/api/my/commissions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows || []);
        setSummary(data.summary || null);
        setAdjustments(data.adjustments || null);
      }
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [token, sinceDays]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/my/commissions"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const filtered = statusFilter === "any" ? rows : rows.filter((r) => r.status === statusFilter);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Percent className="h-6 w-6 text-green-primary" /> My Commissions
          </h1>
          <p className="text-sm text-gray-500 mt-1">Everything you&apos;ve earned across attributed sales — earned, held, paid, and clawed back.</p>
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

      {/* Hero: net available (auto-earn spine + approved manual adjustments) */}
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-6 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Net available</p>
          <p className="text-4xl font-bold text-emerald-800 mt-1">
            {summary ? fmt(summary.combined_net_available_cents ?? summary.net_available_cents) : "…"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Auto-earn spine (earned + clearable held − reversed − outstanding clawbacks)
            {adjustments && adjustments.approved_unpaid_cents > 0 && (
              <> + approved manual adjustments ({fmt(adjustments.approved_unpaid_cents)})</>
            )}
            . Payouts happen manually today; admins will hand this off in your next payroll cycle.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Lifetime paid to you</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">
            {summary ? fmt(summary.paid_cents + (adjustments?.paid_cents || 0)) : "…"}
          </p>
        </div>
      </div>

      {/* Manual adjustments — only if the rep has any */}
      {adjustments && adjustments.row_count > 0 && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-blue-700">Manual adjustments</p>
            <p className="text-[10px] text-blue-800/70">Bonuses + overrides entered by your director / market leader — separate from the auto-earn spine.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-gray-500">Pending</p>
              <p className="text-base font-semibold text-amber-700">{fmt(adjustments.pending_cents)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Approved (unpaid)</p>
              <p className="text-base font-semibold text-emerald-700">{fmt(adjustments.approved_unpaid_cents)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Paid</p>
              <p className="text-base font-semibold text-blue-700">{fmt(adjustments.paid_cents)}</p>
            </div>
          </div>
        </div>
      )}

      {/* By-role breakdown — only when the rep has earnings across multiple roles */}
      {summary && Object.keys(summary.by_role || {}).length > 1 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 mb-4">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-2">Earned by role</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(summary.by_role)
              .sort((a, b) => b[1] - a[1])
              .map(([role, cents]) => (
                <div key={role} className="min-w-[110px]">
                  <p className="text-xs text-gray-500 capitalize">{role.replace(/_/g, " ")}</p>
                  <p className="text-base font-semibold text-gray-900">{fmt(cents)}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <Tile icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-600" />} label="Earned (open)" value={summary ? fmt(summary.earned_cents) : "…"} tint="emerald" />
        <Tile icon={<Clock className="h-3.5 w-3.5 text-amber-600" />} label="Held" value={summary ? fmt(summary.held_cents) : "…"} tint="amber" />
        <Tile icon={<DollarSign className="h-3.5 w-3.5 text-blue-600" />} label="Paid" value={summary ? fmt(summary.paid_cents) : "…"} tint="blue" />
        <Tile icon={<AlertTriangle className="h-3.5 w-3.5 text-red-600" />} label="Reversed" value={summary ? fmt(summary.reversed_cents) : "…"} tint="red" />
        <Tile
          icon={<AlertTriangle className="h-3.5 w-3.5 text-orange-600" />}
          label="Owed back"
          value={summary ? fmt(summary.clawback_pending_cents) : "…"}
          tint={summary && summary.clawback_pending_cents > 0 ? "orange-strong" : "gray"}
          note={summary && summary.clawback_pending_cents > 0 ? "Refunds on sales where commission was already paid" : undefined}
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${statusFilter === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
        {summary && (
          <span className="ml-auto text-xs text-gray-400">{filtered.length} row{filtered.length === 1 ? "" : "s"}</span>
        )}
      </div>

      {/* Rows */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">No commission rows in this window.</p>
            <p className="text-xs text-gray-400 mt-1">Commissions auto-earn when payments land on orders you&apos;re attributed to.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium">Order</th>
                  <th className="text-left py-2 px-2 font-medium">Role</th>
                  <th className="text-right py-2 px-2 font-medium">Basis / Rate</th>
                  <th className="text-right py-2 px-2 font-medium">Amount</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                  <th className="text-left py-2 px-2 font-medium">Earned</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const stStyle = STATUS_STYLES[r.status] || "bg-gray-100 text-gray-500 border-gray-200";
                  return (
                    <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2 px-2 text-xs">
                        <Link href={`/sales/orders/${r.order_id}`} className="font-mono text-green-primary hover:underline">
                          {r.order_id.slice(0, 8)}
                        </Link>
                        {r.order?.order_type && <span className="ml-1 text-[10px] text-gray-400 uppercase">{r.order.order_type}</span>}
                        {r.order?.total_value != null && (
                          <p className="text-gray-400">Order total ${Number(r.order.total_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs capitalize">
                        {r.role_code.replace(/_/g, " ")}
                        <p className="text-gray-400">{Number(r.attribution_percentage).toFixed(1)}% credit</p>
                      </td>
                      <td className="py-2 px-2 text-right text-xs">
                        <p className="font-mono">{fmt(r.basis_cents)}</p>
                        <p className="text-gray-400">× {(r.rate_bps / 100).toFixed(2)}%</p>
                      </td>
                      <td className={`py-2 px-2 text-right font-semibold ${r.amount_cents < 0 ? "text-red-700" : "text-emerald-700"}`}>
                        {fmt(r.amount_cents)}
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${stStyle}`}>
                          {r.status === "clawback_pending" && <AlertTriangle className="h-2.5 w-2.5" />}
                          {r.status.replace(/_/g, " ")}
                        </span>
                        {r.status === "held" && r.clearable_at && (
                          <p className="text-[10px] text-gray-500 mt-0.5">Clears {new Date(r.clearable_at).toLocaleDateString()}</p>
                        )}
                        {r.reversal_reason && <p className="text-[10px] text-red-500 mt-0.5 italic">{r.reversal_reason}</p>}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500">
                        {new Date(r.earned_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ icon, label, value, tint, note }: { icon: React.ReactNode; label: string; value: string; tint: "emerald" | "amber" | "blue" | "red" | "orange-strong" | "gray"; note?: string }) {
  const tints: Record<string, string> = {
    emerald: "border-gray-100 bg-white text-emerald-700",
    amber: "border-gray-100 bg-white text-amber-700",
    blue: "border-gray-100 bg-white text-blue-700",
    red: "border-gray-100 bg-white text-red-700",
    "orange-strong": "border-orange-200 bg-orange-50 text-orange-800",
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
