"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Users, Clock, AlertTriangle, TrendingUp } from "lucide-react";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "ytd";

interface EmployeeRow {
  user_id: string;
  name: string;
  email: string;
  role: string;
  active: number;
  by_type: Record<string, number>;
  overdue: number;
  due_7d: number;
  hours_period: number;
  avg_days_to_close: number | null;
  close_rate: number;
  quotes_sent: number;
  quotes_closed: number;
  capacity: "green" | "yellow" | "red";
}

interface Payload {
  period: { label: string };
  capacity_thresholds: { green_max: number; yellow_max: number };
  employees: EmployeeRow[];
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "quarterly", label: "This Quarter" },
  { value: "ytd", label: "Year to Date" },
  { value: "yearly", label: "This Year" },
];

const TYPE_LABEL: Record<string, string> = {
  ai_machine_fulfillment: "AI",
  location_services: "Loc",
  financing: "Fin",
  coffee_equipment: "Coffee Eq",
  coffee_service: "Coffee Sv",
  website_build: "Web",
};

type SortKey = "name" | "active" | "overdue" | "hours" | "close_rate";

export default function WorkloadPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("monthly");
  const [sortKey, setSortKey] = useState<SortKey>("active");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoading(false); return; }
      const res = await fetch(`/api/sales/workload?period=${period}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setData(await res.json());
      setLoading(false);
    }
    load();
  }, [period]);

  const rows = [...(data?.employees ?? [])].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "name": return a.name.localeCompare(b.name) * dir;
      case "active": return (a.active - b.active) * dir;
      case "overdue": return (a.overdue - b.overdue) * dir;
      case "hours": return (a.hours_period - b.hours_period) * dir;
      case "close_rate": return (a.close_rate - b.close_rate) * dir;
    }
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Workload</h1>
          <p className="text-sm text-gray-500 mt-1">
            Active workflows, capacity, hours, and close rate per employee.
          </p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {data && data.capacity_thresholds && (
        <div className="mb-4 text-xs text-gray-500">
          Capacity: <span className="text-green-700">green ≤{data.capacity_thresholds.green_max}</span>
          {" · "}
          <span className="text-amber-700">yellow ≤{data.capacity_thresholds.yellow_max}</span>
          {" · "}
          <span className="text-red-700">red &gt;{data.capacity_thresholds.yellow_max}</span>
          {" · "}
          set via WORKLOAD_CAPACITY_GREEN_MAX / WORKLOAD_CAPACITY_YELLOW_MAX env vars
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort("name")}>Employee</th>
              <th className="px-4 py-3 cursor-pointer text-right" onClick={() => toggleSort("active")}>Active</th>
              <th className="px-4 py-3">By Type</th>
              <th className="px-4 py-3 cursor-pointer text-right" onClick={() => toggleSort("overdue")}>Overdue</th>
              <th className="px-4 py-3 text-right">Due 7d</th>
              <th className="px-4 py-3 cursor-pointer text-right" onClick={() => toggleSort("hours")}>Hours</th>
              <th className="px-4 py-3 text-right">Avg Close</th>
              <th className="px-4 py-3 cursor-pointer text-right" onClick={() => toggleSort("close_rate")}>Close Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                <Loader2 className="inline-block h-5 w-5 animate-spin mr-2" /> Loading…
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                <Users className="inline-block h-5 w-5 mr-2 text-gray-400" />
                No team members in this scope.
              </td></tr>
            ) : rows.map((r) => (
              <EmployeeRowRender key={r.user_id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeeRowRender({ row }: { row: EmployeeRow }) {
  const capacityColors = {
    green: "bg-green-100 text-green-800",
    yellow: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
  }[row.capacity];

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{row.name}</div>
        <div className="text-xs text-gray-500">{row.role.replace(/_/g, " ")}</div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">{row.active}</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${capacityColors}`}>
            {row.capacity}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {Object.entries(row.by_type).map(([type, count]) => (
            <span key={type} className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
              {TYPE_LABEL[type] ?? type} <span className="font-semibold ml-1">{count}</span>
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        {row.overdue > 0 ? (
          <Link
            href={`/sales/workflows?assignedUserId=${row.user_id}&overdue=true`}
            className="inline-flex items-center gap-1 text-red-700 font-semibold hover:underline"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {row.overdue}
          </Link>
        ) : (
          <span className="text-gray-400">0</span>
        )}
      </td>
      <td className="px-4 py-3 text-right text-amber-700">{row.due_7d > 0 ? row.due_7d : "—"}</td>
      <td className="px-4 py-3 text-right text-gray-900">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          {row.hours_period}h
        </span>
      </td>
      <td className="px-4 py-3 text-right text-gray-700">
        {row.avg_days_to_close != null ? `${row.avg_days_to_close}d` : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <span className="inline-flex items-center gap-1 text-gray-900">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          {row.quotes_sent > 0 ? `${Math.round(row.close_rate * 100)}%` : "—"}
        </span>
        {row.quotes_sent > 0 && (
          <div className="text-xs text-gray-400">{row.quotes_closed}/{row.quotes_sent}</div>
        )}
      </td>
    </tr>
  );
}
