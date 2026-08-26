"use client";

/**
 * /admin/payroll — payroll onboarding dashboard.
 *
 * Admin-only. Lists every payroll profile with status pill,
 * classification, hire date, and last-updated. Top-of-page tiles
 * show status counts. Sensitive fields (SSN / TIN / bank) are
 * NEVER surfaced in the list — display is names + statuses only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import {
  ArrowRight,
  Coins,
  Loader2,
  Search,
} from "lucide-react";
import {
  CLASSIFICATION_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  type PayrollClassification,
  type PayrollStatus,
} from "@/lib/payroll/constants";

interface Row {
  id: string;
  team_member_id: string;
  classification: PayrollClassification;
  status: PayrollStatus;
  hire_date: string | null;
  updated_at: string;
  team_member: { full_name: string | null; email: string | null } | null;
  submitted_at: string | null;
  company_entity: string | null;
}

export default function PayrollDashboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | PayrollStatus>("");
  const [classFilter, setClassFilter] = useState<"" | PayrollClassification>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError("Sign in required."); setLoading(false); return; }
      const res = await fetch("/api/admin/payroll/profiles", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 403) { setError("Admin permission required."); setLoading(false); return; }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Failed (${res.status})`);
        setLoading(false);
        return;
      }
      const json = await res.json();
      setRows(json.profiles ?? []);
      setCounts(json.counts ?? {});
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (classFilter && r.classification !== classFilter) return false;
      if (!q) return true;
      const name = (r.team_member?.full_name ?? "").toLowerCase();
      const email = (r.team_member?.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [rows, search, statusFilter, classFilter]);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="h-6 w-6 text-green-primary" />
            <h1 className="text-2xl font-semibold text-gray-900">Payroll Onboarding</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Every payroll profile in one place. Sensitive fields (SSN / TIN / bank) are always masked here — reveal one field at a time on the detail page.
          </p>
        </div>
        <Link
          href="/sales/team"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:border-green-primary hover:text-green-primary"
        >
          <ArrowRight className="h-4 w-4 rotate-180" />
          Back to Team
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {(["invite_sent", "in_progress", "employee_action_required", "admin_review_required", "ready_for_quickbooks", "payroll_active"] as PayrollStatus[]).map((s) => (
          <div key={s} className={`rounded-lg border px-3 py-2 ${STATUS_TONES[s]}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{STATUS_LABELS[s]}</div>
            <div className="text-2xl font-bold">{counts[s] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 py-2 text-sm"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | PayrollStatus)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value as "" | PayrollClassification)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="">All Classifications</option>
          <option value="w2_employee">W-2 Employee</option>
          <option value="1099_contractor">1099 Contractor</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Team Member</th>
              <th className="px-4 py-3">Classification</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Hire Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500"><Loader2 className="inline-block h-5 w-5 animate-spin mr-2" /> Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No payroll profiles match these filters.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{r.team_member?.full_name ?? <span className="italic text-gray-400">Name missing</span>}</div>
                  <div className="text-xs text-gray-500">{r.team_member?.email ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{CLASSIFICATION_LABELS[r.classification]}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{r.company_entity ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{r.hire_date ? new Date(r.hire_date).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_TONES[r.status]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/payroll/${r.id}`} className="inline-flex items-center gap-1 rounded-lg bg-green-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-hover">
                    View <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
