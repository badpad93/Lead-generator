"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Factory, AlertCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface PartnerRow {
  id: string;
  legal_company_name: string;
  dba_or_brand: string | null;
  entity_type: string;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  status: string;
  current_agreement_version: string | null;
  payout_status: string;
  dwolla_verified_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  summary: { equipment: number; pending_exceptions: number; orders: number; sales_cents: number } | null;
}

const STATUS_FILTERS = [
  "all",
  "draft",
  "submitted",
  "pending_review",
  "changes_requested",
  "approved",
  "active",
  "suspended",
  "rejected",
  "terminated",
] as const;

export default function AdminManufacturersPage() {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/manufacturers", {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `Failed (HTTP ${res.status})`);
      else setRows(data.partners ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter !== "all") out = out.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) =>
        r.legal_company_name.toLowerCase().includes(q) ||
        (r.dba_or_brand ?? "").toLowerCase().includes(q) ||
        (r.primary_contact_email ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [rows, statusFilter, search]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900">Manufacturers &amp; Wholesalers</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Applications, agreements, equipment approvals, and marketplace performance.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company or contact…"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading manufacturers…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Company</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Contact</th>
                <th className="px-4 py-3 text-right font-medium">Equipment</th>
                <th className="px-4 py-3 text-right font-medium">Pending Excs</th>
                <th className="px-4 py-3 text-right font-medium">Orders</th>
                <th className="px-4 py-3 text-right font-medium">Sales</th>
                <th className="px-4 py-3 text-left font-medium">Agreement</th>
                <th className="px-4 py-3 text-left font-medium">Payout</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/marketplace/manufacturers/${r.id}`}
                      className="font-medium text-gray-900 hover:text-green-700"
                    >
                      {r.legal_company_name}
                    </Link>
                    {r.dba_or_brand && (
                      <div className="text-xs text-gray-500">dba {r.dba_or_brand}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{r.entity_type}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>{r.primary_contact_name ?? "—"}</div>
                    <div className="text-xs text-gray-400">{r.primary_contact_email ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.summary?.equipment ?? 0}</td>
                  <td className={`px-4 py-3 text-right ${((r.summary?.pending_exceptions ?? 0) > 0) ? "text-amber-700 font-semibold" : "text-gray-400"}`}>
                    {r.summary?.pending_exceptions ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.summary?.orders ?? 0}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {r.summary ? `$${((r.summary.sales_cents ?? 0) / 100).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {r.current_agreement_version ? `v${r.current_agreement_version}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs capitalize">{r.payout_status}</td>
                  <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-400">
                    No manufacturers match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    submitted: "bg-blue-50 text-blue-700",
    pending_review: "bg-yellow-50 text-yellow-800",
    changes_requested: "bg-orange-50 text-orange-800",
    approved: "bg-green-50 text-green-700",
    active: "bg-green-100 text-green-800 font-semibold",
    suspended: "bg-red-50 text-red-700",
    rejected: "bg-gray-100 text-gray-500 line-through",
    terminated: "bg-gray-100 text-gray-500 line-through",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${map[status] ?? map.draft}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
