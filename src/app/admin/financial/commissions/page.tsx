"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Percent, ArrowLeft, Filter, Play, DollarSign, CheckSquare, Square, AlertCircle, CheckCircle2, Database, AlertTriangle, Undo2, XCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface LedgerRow {
  id: string;
  user_id: string;
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
  reversed_of_id: string | null;
  reversal_reason: string | null;
  user: { id: string; full_name: string | null; email: string | null } | null;
  order: { id: string; total_value: number; order_type: string | null; order_status: string; created_at: string } | null;
}

interface Summary {
  earned_cents: number;
  held_cents: number;
  pending_clearable_cents: number;
  reversed_cents: number;
  paid_cents: number;
  clawback_pending_cents: number;
  clawback_collected_cents: number;
  clawback_waived_cents: number;
  net_available_cents: number;
  row_count: number;
}

interface RoleOption {
  code: string;
  label: string;
}

const STATUS_FILTERS = [
  { key: "any", label: "Any status" },
  { key: "earned", label: "Earned" },
  { key: "held", label: "Held" },
  { key: "paid", label: "Paid" },
  { key: "reversed", label: "Reversed" },
  { key: "clawback_pending", label: "Clawback owed" },
  { key: "clawback_collected", label: "Clawback collected" },
  { key: "clawback_waived", label: "Clawback waived" },
];

const STATUS_STYLES: Record<string, string> = {
  earned: "bg-emerald-50 text-emerald-700 border-emerald-100",
  held: "bg-amber-50 text-amber-700 border-amber-100",
  paid: "bg-blue-50 text-blue-700 border-blue-100",
  reversed: "bg-red-50 text-red-700 border-red-100",
  clawback_pending: "bg-orange-50 text-orange-700 border-orange-200",
  clawback_collected: "bg-emerald-50 text-emerald-700 border-emerald-100",
  clawback_waived: "bg-gray-100 text-gray-500 border-gray-200",
};

function fmt(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminCommissionsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);

  const [statusFilter, setStatusFilter] = useState("any");
  const [roleFilter, setRoleFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [repOptions, setRepOptions] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [backfillNeeded, setBackfillNeeded] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [marking, setMarking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "any") params.set("status", statusFilter);
    if (roleFilter) params.set("role_code", roleFilter);
    if (userFilter) params.set("user_id", userFilter);
    const [ledgerRes, rolesRes, backfillRes, repsRes] = await Promise.all([
      fetch(`/api/admin/financial/commissions?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/attribution-roles", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/admin/financial/commissions/backfill", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/admin/users?role=sales&limit=200", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (ledgerRes.ok) {
      const data = await ledgerRes.json();
      setRows(data.rows || []);
      setSummary(data.summary || null);
    }
    if (rolesRes.ok) setRoles(await rolesRes.json());
    if (backfillRes.ok) {
      const b = await backfillRes.json();
      setBackfillNeeded(Number(b.needs_backfill) || 0);
    }
    if (repsRes.ok) {
      const j = await repsRes.json();
      setRepOptions(Array.isArray(j) ? j : j.users || []);
    }
    setLoading(false);
  }, [token, statusFilter, roleFilter, userFilter]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/financial/commissions"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function runBackfill() {
    if (!confirm("Compute commission ledger rows for paid payments that don't have any yet? Idempotent — safe to re-run.")) return;
    setRunning(true);
    setError(null); setMessage(null);
    const res = await fetch("/api/admin/financial/commissions/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ limit: 1000, since_days: 365 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Backfill failed");
    else {
      const parts: string[] = [];
      parts.push(`scanned ${body.scanned}`);
      parts.push(`earned on ${body.earned} orders`);
      if (body.orphan_payments_repaired) parts.push(`repaired ${body.orphan_payments_repaired} orphan payment${body.orphan_payments_repaired === 1 ? "" : "s"}`);
      if (body.synthesized_payments) parts.push(`synthesized ${body.synthesized_payments} manual payment${body.synthesized_payments === 1 ? "" : "s"}`);
      if (body.errors && body.errors.length) parts.push(`${body.errors.length} error${body.errors.length === 1 ? "" : "s"}`);
      setMessage(`Backfill complete — ${parts.join(", ")}.`);
    }
    await load();
    setRunning(false);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    // When the "Clawbacks" filter is active, select-all grabs pending
    // clawbacks. Otherwise it grabs payable rows (earned + clearable held).
    const isClawbackView = statusFilter === "clawback_pending";
    const eligible = isClawbackView
      ? rows.filter((r) => r.status === "clawback_pending").map((r) => r.id)
      : rows
          .filter((r) => r.status === "earned" || (r.status === "held" && r.clearable_at && new Date(r.clearable_at).getTime() <= Date.now()))
          .map((r) => r.id);
    if (eligible.every((id) => selected.has(id)) && eligible.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible));
    }
  }

  async function markPaid() {
    if (selected.size === 0) return;
    if (!confirm(`Mark ${selected.size} commission row${selected.size === 1 ? "" : "s"} as paid? This does not send money — Phase 6 will hand off to QB.`)) return;
    setMarking(true);
    setError(null); setMessage(null);
    const res = await fetch("/api/admin/financial/commissions/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: Array.from(selected), note: "Manual mark-paid from admin inspector" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Mark-paid failed");
    else setMessage(`Marked ${body.paid} rows as paid (${fmt(body.total_cents)}).`);
    setSelected(new Set());
    await load();
    setMarking(false);
  }

  async function settleClawback(id: string, outcome: "collected" | "waived") {
    const label = outcome === "collected" ? "collected (recovered from rep)" : "waived (company absorbs)";
    if (!confirm(`Mark this clawback ${label}?`)) return;
    setMarking(true);
    setError(null); setMessage(null);
    const res = await fetch("/api/admin/financial/commissions/clawbacks/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: [id], outcome, note: outcome === "collected" ? "Recovered from rep" : "Waived by admin" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Clawback update failed");
    else setMessage(`${body.settled} clawback${body.settled === 1 ? "" : "s"} ${outcome} (${fmt(body.total_cents)}).`);
    await load();
    setMarking(false);
  }

  async function bulkSettleClawbacks(outcome: "collected" | "waived") {
    const selectedClawbacks = Array.from(selected).filter((id) => {
      const r = rows.find((row) => row.id === id);
      return r && r.status === "clawback_pending";
    });
    if (selectedClawbacks.length === 0) return;
    const label = outcome === "collected" ? "collected (recovered from rep)" : "waived (company absorbs)";
    if (!confirm(`Mark ${selectedClawbacks.length} clawback${selectedClawbacks.length === 1 ? "" : "s"} as ${label}?`)) return;
    setMarking(true);
    setError(null); setMessage(null);
    const res = await fetch("/api/admin/financial/commissions/clawbacks/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: selectedClawbacks, outcome }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Clawback update failed");
    else setMessage(`${body.settled} clawback${body.settled === 1 ? "" : "s"} ${outcome} (${fmt(body.total_cents)}).`);
    setSelected(new Set());
    await load();
    setMarking(false);
  }

  const eligibleCount = rows.filter((r) =>
    r.status === "earned" || (r.status === "held" && r.clearable_at && new Date(r.clearable_at).getTime() <= Date.now())
  ).length;

  const selectedClawbackCount = Array.from(selected).filter((id) => {
    const r = rows.find((row) => row.id === id);
    return r && r.status === "clawback_pending";
  }).length;
  const selectedPayableCount = Array.from(selected).filter((id) => {
    const r = rows.find((row) => row.id === id);
    return r && (r.status === "earned" || (r.status === "held" && r.clearable_at && new Date(r.clearable_at).getTime() <= Date.now()));
  }).length;

  return (
    <div className="p-6">
      <Link href="/admin/financial" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Financial Center
      </Link>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Percent className="h-6 w-6 text-green-primary" /> Commission Ledger
          </h1>
          <p className="text-sm text-gray-500 mt-1">Auto-earn fires on paid payments using active attribution + rate rules. Refunds and chargebacks write pro-rata reversals.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/financial/settings" className="rounded-xl border border-gray-200 hover:bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
            Rules & holds
          </Link>
          <button
            onClick={runBackfill}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-700 cursor-pointer disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Backfill
            {backfillNeeded !== null && backfillNeeded > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">{backfillNeeded}</span>}
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Net available hero — only shows when scoped to a single rep */}
      {userFilter && summary && (
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">
              Net available to {repOptions.find((r) => r.id === userFilter)?.full_name || repOptions.find((r) => r.id === userFilter)?.email || "this rep"}
            </p>
            <p className="text-3xl font-bold text-emerald-800 mt-1">{fmt(summary.net_available_cents)}</p>
            <p className="text-[11px] text-gray-500 mt-1">Earned + clearable held − reversed − outstanding clawbacks. Matches the number this rep sees on their My Commissions page.</p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Earned (open)</p>
          <p className="text-lg font-bold text-emerald-700 mt-1">{summary ? fmt(summary.earned_cents) : "…"}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Held</p>
          <p className="text-lg font-bold text-amber-700 mt-1">{summary ? fmt(summary.held_cents) : "…"}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Paid</p>
          <p className="text-lg font-bold text-blue-700 mt-1">{summary ? fmt(summary.paid_cents) : "…"}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Reversed</p>
          <p className="text-lg font-bold text-red-700 mt-1">{summary ? fmt(summary.reversed_cents) : "…"}</p>
        </div>
        <div
          className={`rounded-2xl border p-4 ${summary && summary.clawback_pending_cents > 0 ? "border-orange-200 bg-orange-50" : "border-gray-100 bg-white"}`}
          title="Reversals against commissions already paid to the rep — money owed back that hasn't been settled yet."
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 flex items-center gap-1">
            {summary && summary.clawback_pending_cents > 0 && <AlertTriangle className="h-3 w-3 text-orange-600" />}
            Clawback owed
          </p>
          <p className={`text-lg font-bold mt-1 ${summary && summary.clawback_pending_cents > 0 ? "text-orange-700" : "text-gray-400"}`}>
            {summary ? fmt(summary.clawback_pending_cents) : "…"}
          </p>
          {summary && summary.clawback_pending_cents > 0 && statusFilter !== "clawback_pending" && (
            <button
              onClick={() => setStatusFilter("clawback_pending")}
              className="mt-1 text-[10px] text-orange-700 hover:underline cursor-pointer"
            >
              Review →
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs">
          <option value="">All reps</option>
          {repOptions.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email || r.id.slice(0, 8)}</option>)}
        </select>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs">
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${statusFilter === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {selectedPayableCount > 0 && (
              <button
                onClick={markPaid}
                disabled={marking}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {marking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
                Mark {selectedPayableCount} paid
              </button>
            )}
            {selectedClawbackCount > 0 && (
              <>
                <button
                  onClick={() => bulkSettleClawbacks("collected")}
                  disabled={marking}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                >
                  {marking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                  Collect {selectedClawbackCount}
                </button>
                <button
                  onClick={() => bulkSettleClawbacks("waived")}
                  disabled={marking}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Waive {selectedClawbackCount}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">
            <Database className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p>No commission rows match the current filters.</p>
            {backfillNeeded !== null && backfillNeeded > 0 && (
              <p className="text-xs text-gray-400 mt-1">{backfillNeeded} paid payment{backfillNeeded === 1 ? "" : "s"} could be backfilled.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium w-8">
                    <button onClick={toggleAllVisible} className="cursor-pointer text-gray-400 hover:text-gray-700" title="Select eligible">
                      {eligibleCount > 0 && rows.filter((r) => selected.has(r.id)).length >= eligibleCount ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                  </th>
                  <th className="text-left py-2 px-2 font-medium">User</th>
                  <th className="text-left py-2 px-2 font-medium">Role</th>
                  <th className="text-right py-2 px-2 font-medium">Rate</th>
                  <th className="text-right py-2 px-2 font-medium">Amount</th>
                  <th className="text-left py-2 px-2 font-medium">Order</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                  <th className="text-left py-2 px-2 font-medium">Earned</th>
                  <th className="text-right py-2 px-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isPayable = r.status === "earned" || (r.status === "held" && r.clearable_at && new Date(r.clearable_at).getTime() <= Date.now());
                  const isClawback = r.status === "clawback_pending";
                  const selectable = isPayable || isClawback;
                  const stStyle = STATUS_STYLES[r.status] || "bg-gray-100 text-gray-500 border-gray-200";
                  const rowTint = selected.has(r.id)
                    ? (isClawback ? "bg-orange-50/60" : "bg-green-50/40")
                    : (isClawback ? "bg-orange-50/20" : "");
                  return (
                    <tr key={r.id} className={`border-b border-gray-50 last:border-b-0 ${rowTint}`}>
                      <td className="py-2 px-2">
                        {selectable ? (
                          <button onClick={() => toggleSelected(r.id)} className="cursor-pointer text-gray-400 hover:text-gray-700">
                            {selected.has(r.id) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                          </button>
                        ) : (
                          <Square className="h-4 w-4 text-gray-200" />
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        <p className="font-medium text-gray-900">{r.user?.full_name || r.user?.email || r.user_id.slice(0, 8)}</p>
                        <p className="text-gray-400">{r.user?.email}</p>
                      </td>
                      <td className="py-2 px-2 text-xs capitalize">{r.role_code.replace(/_/g, " ")}</td>
                      <td className="py-2 px-2 text-right text-xs">
                        <span className="font-mono">{(r.rate_bps / 100).toFixed(2)}%</span>
                        <span className="text-gray-400 block">× {Number(r.attribution_percentage).toFixed(1)}% attr</span>
                      </td>
                      <td className={`py-2 px-2 text-right font-semibold ${r.amount_cents < 0 ? "text-red-700" : "text-emerald-700"}`}>
                        {fmt(r.amount_cents)}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        <Link href={`/sales/orders/${r.order_id}`} className="font-mono text-green-primary hover:underline">
                          {r.order_id.slice(0, 8)}
                        </Link>
                        {r.order?.order_type && <span className="ml-1 text-[10px] text-gray-400 uppercase">{r.order.order_type}</span>}
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${stStyle}`}>
                          {r.status === "clawback_pending" && <AlertTriangle className="h-2.5 w-2.5" />}
                          {r.status.replace(/_/g, " ")}
                          {r.status === "held" && r.clearable_at && (
                            <span className="ml-1 text-gray-500">→ {new Date(r.clearable_at).toLocaleDateString()}</span>
                          )}
                        </span>
                        {r.reversal_reason && <p className="text-[10px] text-red-500 mt-0.5 italic">{r.reversal_reason}</p>}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500">
                        {new Date(r.earned_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        {isClawback ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => settleClawback(r.id, "collected")}
                              disabled={marking}
                              className="rounded-md bg-orange-100 hover:bg-orange-200 px-2 py-0.5 text-[10px] font-semibold text-orange-800 cursor-pointer disabled:opacity-50"
                              title="Rep repaid — mark this clawback recovered"
                            >
                              Collect
                            </button>
                            <button
                              onClick={() => settleClawback(r.id, "waived")}
                              disabled={marking}
                              className="rounded-md border border-gray-200 hover:bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600 cursor-pointer disabled:opacity-50"
                              title="Company absorbs the loss"
                            >
                              Waive
                            </button>
                          </div>
                        ) : null}
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
