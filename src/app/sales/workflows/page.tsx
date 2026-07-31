"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import {
  Search,
  Loader2,
  Filter,
  ArrowUpDown,
  Package,
  MapPin,
  DollarSign,
  Coffee,
  Coffee as CoffeeIcon,
  Globe,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Pause,
  XCircle,
} from "lucide-react";

interface WorkflowRow {
  id: string;
  workflow_number: string;
  workflow_type: string;
  title: string;
  product_name: string | null;
  quantity_purchased: number;
  quantity_completed: number;
  overall_status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  primary_team: string | null;
  assigned_user_id: string | null;
  customer_id: string;
  company_id: string | null;
  updated_at: string;
}

const TYPE_META: Record<string, { label: string; icon: typeof Package; team: string }> = {
  ai_machine_fulfillment: { label: "AI Machine", icon: Package, team: "fulfillment" },
  location_services: { label: "Location Services", icon: MapPin, team: "locations" },
  financing: { label: "Financing", icon: DollarSign, team: "financing" },
  coffee_equipment: { label: "Coffee Equipment", icon: Coffee, team: "coffee" },
  coffee_service: { label: "Coffee Service", icon: CoffeeIcon, team: "coffee" },
  website_build: { label: "Website Build", icon: Globe, team: "fulfillment" },
};

const STATUS_STYLE: Record<string, { badge: string; label: string }> = {
  draft: { badge: "bg-gray-100 text-gray-700", label: "Draft" },
  pending_payment: { badge: "bg-amber-100 text-amber-800", label: "Pending Payment" },
  ready_to_begin: { badge: "bg-sky-100 text-sky-800", label: "Ready" },
  not_started: { badge: "bg-slate-100 text-slate-700", label: "Not Started" },
  in_progress: { badge: "bg-emerald-100 text-emerald-800", label: "In Progress" },
  waiting_on_customer: { badge: "bg-orange-100 text-orange-800", label: "Waiting on Customer" },
  waiting_on_vendor: { badge: "bg-orange-100 text-orange-800", label: "Waiting on Vendor" },
  on_hold: { badge: "bg-yellow-100 text-yellow-800", label: "On Hold" },
  at_risk: { badge: "bg-amber-100 text-amber-800", label: "At Risk" },
  overdue: { badge: "bg-red-100 text-red-800", label: "Overdue" },
  completed: { badge: "bg-emerald-100 text-emerald-800", label: "Completed" },
  cancelled: { badge: "bg-gray-100 text-gray-500 line-through", label: "Cancelled" },
  refunded: { badge: "bg-gray-100 text-gray-500", label: "Refunded" },
  expired: { badge: "bg-gray-100 text-gray-500", label: "Expired" },
};

type Filters = {
  workflowType: string;
  status: string;
  overdue: string;
  unassigned: string;
  search: string;
};

const EMPTY_FILTERS: Filters = {
  workflowType: "",
  status: "",
  overdue: "",
  unassigned: "",
  search: "",
};

function filtersForView(savedView: string, search: string): Filters {
  switch (savedView) {
    case "overdue":
      return { ...EMPTY_FILTERS, search, overdue: "true" };
    case "unassigned":
      return { ...EMPTY_FILTERS, search, unassigned: "true" };
    case "in_progress":
      return { ...EMPTY_FILTERS, search, status: "in_progress" };
    case "completed":
      return { ...EMPTY_FILTERS, search, status: "completed" };
    default:
      if (Object.hasOwn(TYPE_META, savedView)) {
        return { ...EMPTY_FILTERS, search, workflowType: savedView };
      }
      return { ...EMPTY_FILTERS, search };
  }
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savedView, setSavedView] = useState<string>("all");
  const [orderBy, setOrderBy] = useState<"due_date" | "created_at" | "updated_at" | "priority">("due_date");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");

  const filters = useMemo(() => filtersForView(savedView, search), [savedView, search]);

  // We snapshot Date.now() at fetch time and thread it down into row
  // renders. This keeps the render pass pure (React 19 purity rule)
  // while still giving accurate "5m ago" / "3d overdue" labels.
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setLoading(false);
        return;
      }

      const qs = new URLSearchParams();
      if (filters.workflowType) qs.set("workflowType", filters.workflowType);
      if (filters.status) qs.set("status", filters.status);
      if (filters.overdue) qs.set("overdue", filters.overdue);
      if (filters.unassigned) qs.set("unassigned", filters.unassigned);
      if (filters.search) qs.set("search", filters.search);
      qs.set("orderBy", orderBy);
      qs.set("orderDir", orderDir);
      qs.set("limit", "100");

      const res = await fetch(`/api/workflows?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows ?? []);
      }
      setNowMs(Date.now());
      setLoading(false);
    }
    load();
  }, [filters, orderBy, orderDir]);

  const counts = useMemo(() => {
    const total = workflows.length;
    const overdue = nowMs === 0
      ? 0
      : workflows.filter(
          (w) => w.due_date && new Date(w.due_date).getTime() < nowMs && !["completed", "cancelled"].includes(w.overall_status),
        ).length;
    const unassigned = workflows.filter((w) => !w.assigned_user_id).length;
    return { total, overdue, unassigned };
  }, [workflows, nowMs]);

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-1">
            Fulfillment status across every customer product and service.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <MetricPill label="Active" value={counts.total} />
          <MetricPill label="Overdue" value={counts.overdue} tone="danger" />
          <MetricPill label="Unassigned" value={counts.unassigned} tone="warn" />
        </div>
      </div>

      {/* Saved views */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SavedViewChip label="All" active={savedView === "all"} onClick={() => setSavedView("all")} />
        <SavedViewChip label="Overdue" active={savedView === "overdue"} onClick={() => setSavedView("overdue")} tone="danger" />
        <SavedViewChip label="Unassigned" active={savedView === "unassigned"} onClick={() => setSavedView("unassigned")} tone="warn" />
        <SavedViewChip label="In Progress" active={savedView === "in_progress"} onClick={() => setSavedView("in_progress")} />
        <SavedViewChip label="Completed" active={savedView === "completed"} onClick={() => setSavedView("completed")} />
        <div className="w-px h-6 bg-gray-200 mx-1" />
        {Object.entries(TYPE_META).map(([type, meta]) => (
          <SavedViewChip
            key={type}
            label={meta.label}
            active={savedView === type}
            onClick={() => setSavedView(type)}
          />
        ))}
      </div>

      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number, title, or product…"
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
          <ArrowUpDown className="h-4 w-4 text-gray-400" />
          <select
            value={orderBy}
            onChange={(e) => setOrderBy(e.target.value as typeof orderBy)}
            className="bg-transparent focus:outline-none"
          >
            <option value="due_date">Due date</option>
            <option value="updated_at">Last updated</option>
            <option value="created_at">Created</option>
            <option value="priority">Priority</option>
          </select>
          <button
            type="button"
            onClick={() => setOrderDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="text-gray-500 hover:text-gray-800 uppercase text-xs tracking-wide"
          >
            {orderDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Workflow</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  <Loader2 className="inline-block h-5 w-5 animate-spin mr-2" />
                  Loading workflows…
                </td>
              </tr>
            ) : workflows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  <Filter className="inline-block h-5 w-5 mr-2 text-gray-400" />
                  No workflows match the current filters.
                </td>
              </tr>
            ) : (
              workflows.map((w) => <WorkflowRowRender key={w.id} workflow={w} nowMs={nowMs} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkflowRowRender({ workflow, nowMs }: { workflow: WorkflowRow; nowMs: number }) {
  const meta = TYPE_META[workflow.workflow_type] ?? { label: workflow.workflow_type, icon: Package, team: "" };
  const Icon = meta.icon;
  const status = STATUS_STYLE[workflow.overall_status] ?? STATUS_STYLE.not_started;
  const total = Number(workflow.quantity_purchased);
  const done = Number(workflow.quantity_completed);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  const dueMs = workflow.due_date ? new Date(workflow.due_date).getTime() : null;
  const daysDelta = dueMs != null && nowMs !== 0 ? Math.floor((dueMs - nowMs) / 86400_000) : null;
  let dueTone = "text-gray-500";
  let dueLabel = "—";
  if (dueMs != null) {
    if (daysDelta! < 0) {
      dueTone = "text-red-600 font-semibold";
      dueLabel = `${Math.abs(daysDelta!)}d overdue`;
    } else if (daysDelta! === 0) {
      dueTone = "text-amber-600 font-semibold";
      dueLabel = "Due today";
    } else if (daysDelta! <= 7) {
      dueTone = "text-amber-600";
      dueLabel = `${daysDelta}d left`;
    } else {
      dueTone = "text-gray-700";
      dueLabel = `${daysDelta}d left`;
    }
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <Link href={`/sales/workflows/${workflow.id}`} className="block">
          <div className="font-mono text-xs text-gray-500">{workflow.workflow_number}</div>
          <div className="font-medium text-gray-900 hover:text-emerald-700">{workflow.title}</div>
          {workflow.product_name && <div className="text-xs text-gray-500 mt-0.5">{workflow.product_name}</div>}
        </Link>
      </td>
      <td className="px-4 py-3">
        <div className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
        </div>
      </td>
      <td className="px-4 py-3">
        {total > 0 ? (
          <div className="w-40">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>{done} / {total}</span>
              <span>{pct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={workflow.overall_status} label={status.label} className={status.badge} />
      </td>
      <td className={`px-4 py-3 text-sm ${dueTone}`}>{dueLabel}</td>
      <td className="px-4 py-3 text-xs text-gray-500">{formatRelative(workflow.updated_at, nowMs)}</td>
    </tr>
  );
}

function StatusBadge({ status, label, className }: { status: string; label: string; className: string }) {
  let Icon = Clock;
  if (status === "completed") Icon = CheckCircle2;
  else if (status === "overdue" || status === "at_risk") Icon = AlertTriangle;
  else if (status === "on_hold") Icon = Pause;
  else if (status === "cancelled") Icon = XCircle;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function MetricPill({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" | "warn" }) {
  const cls =
    tone === "danger"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-gray-50 text-gray-700 border-gray-200";
  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${cls}`}>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function SavedViewChip({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "danger" | "warn";
}) {
  const base = active
    ? "bg-emerald-600 text-white border-emerald-600"
    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50";
  const toneAccent = tone === "danger" && !active ? "text-red-700" : tone === "warn" && !active ? "text-amber-700" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${base} ${toneAccent}`}
    >
      {label}
    </button>
  );
}

function formatRelative(iso: string, nowMs: number): string {
  const ref = nowMs === 0 ? new Date(iso).getTime() : nowMs;
  const ms = ref - new Date(iso).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
