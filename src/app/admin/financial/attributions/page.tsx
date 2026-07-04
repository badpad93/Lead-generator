"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Users, ArrowLeft, Lock, Filter, Play } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface AttributionRow {
  id: string;
  order_id: string;
  user_id: string;
  role_code: string;
  percentage: number;
  locked_at: string | null;
  locked_by_event: string | null;
  is_legacy_backfill: boolean;
  created_at: string;
  order: { id: string; total_value: number; order_status: string; payment_status: string; created_at: string; assigned_rep_id: string | null } | null;
  user: { full_name: string; email: string } | null;
}

interface RoleOption {
  code: string;
  label: string;
}

const LOCKED_FILTERS = [
  { key: "any", label: "Any lock state" },
  { key: "true", label: "Locked" },
  { key: "false", label: "Unlocked" },
];

export default function AdminAttributionsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<AttributionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [lockedFilter, setLockedFilter] = useState("any");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (roleFilter) params.set("role_code", roleFilter);
    if (lockedFilter !== "any") params.set("locked", lockedFilter);
    const [rowsRes, rolesRes] = await Promise.all([
      fetch(`/api/admin/financial/attributions?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/attribution-roles", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (rowsRes.ok) setRows(await rowsRes.json());
    if (rolesRes.ok) setRoles(await rolesRes.json());
    setLoading(false);
  }, [token, roleFilter, lockedFilter]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/financial/attributions"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function runBackfill() {
    if (!confirm("Seed implicit 100% Lead Owner rows for every legacy order without attribution? Idempotent — safe to re-run.")) return;
    setRunning(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/financial/attributions/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ limit: 1000, since_days: 3650 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Backfill failed");
    else setMessage(`Backfill complete — seeded ${body.seeded}, skipped ${body.skipped_existing + body.skipped_no_rep}.`);
    await load();
    setRunning(false);
  }

  return (
    <div className="p-6">
      <Link href="/admin/financial" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Financial Center
      </Link>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-green-primary" /> Attribution Inspector
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Every credited user across every order. Filter by role or lock state. Individual splits are edited on the order page.
          </p>
        </div>
        <button
          onClick={runBackfill}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 cursor-pointer disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Backfill legacy orders
        </button>
      </div>

      {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs">
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
        {LOCKED_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setLockedFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${lockedFilter === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No attribution rows match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium">User</th>
                  <th className="text-left py-2 px-2 font-medium">Role</th>
                  <th className="text-right py-2 px-2 font-medium">%</th>
                  <th className="text-left py-2 px-2 font-medium">Order</th>
                  <th className="text-right py-2 px-2 font-medium">Order $</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                  <th className="text-left py-2 px-2 font-medium">Set</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="py-2 px-2 text-xs">
                      <p className="font-medium text-gray-900">{r.user?.full_name || r.user?.email || r.user_id.slice(0, 8)}</p>
                      <p className="text-gray-400">{r.user?.email}</p>
                    </td>
                    <td className="py-2 px-2 text-xs capitalize">{r.role_code.replace(/_/g, " ")}</td>
                    <td className="py-2 px-2 text-right font-semibold text-emerald-700">{Number(r.percentage).toFixed(1)}%</td>
                    <td className="py-2 px-2 text-xs">
                      <Link href={`/sales/orders/${r.order_id}`} className="font-mono text-green-primary hover:underline">
                        {r.order_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2 px-2 text-right text-xs">
                      ${(Number(r.order?.total_value || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2">
                      {r.locked_at ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <Lock className="h-3 w-3" />
                          {r.locked_by_event?.replace(/_/g, " ") || "locked"}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">unlocked</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()}
                      {r.is_legacy_backfill && <span className="ml-1 text-[10px] text-amber-600">(legacy)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
