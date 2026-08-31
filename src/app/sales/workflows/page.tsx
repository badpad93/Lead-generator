"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  Plus,
  X,
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
  customer_name: string | null;
  customer_email: string | null;
  assigned_user_name: string | null;
  assigned_user_email: string | null;
  // Populated by the API when the historical assigned_user_id is
  // null but there's an active collaborator in workflow_assignments
  // (sales_rep, location_specialist, etc.). Drives the "Assigned"
  // column so real ownership shows through instead of "Unassigned".
  assigned_user_id_effective: string | null;
  assigned_user_role: string | null;
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
  assignedUserId: string;
};

const EMPTY_FILTERS: Filters = {
  workflowType: "",
  status: "",
  overdue: "",
  unassigned: "",
  search: "",
  assignedUserId: "",
};

function filtersForView(savedView: string, search: string, assignedUserId: string): Filters {
  switch (savedView) {
    case "overdue":
      return { ...EMPTY_FILTERS, search, assignedUserId, overdue: "true" };
    case "unassigned":
      return { ...EMPTY_FILTERS, search, assignedUserId, unassigned: "true" };
    case "in_progress":
      return { ...EMPTY_FILTERS, search, assignedUserId, status: "in_progress" };
    case "completed":
      return { ...EMPTY_FILTERS, search, assignedUserId, status: "completed" };
    case "all":
      return { ...EMPTY_FILTERS, search, assignedUserId };
    default:
      // Any non-preset saved view IS a workflow_type filter — both
      // built-in ids (ai_machine_fulfillment, coffee_service, …) and
      // custom template types (custom:cold_calling, …) pass through
      // untouched. Server-side accepts either via zod
      // workflowTypeEnum.
      return { ...EMPTY_FILTERS, search, assignedUserId, workflowType: savedView };
  }
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Deep-link support for the Executive Snapshot chips (?workflowType=…)
  // and for the Team Workload page's "overdue" link (?overdue=true).
  // filtersForView already keys off savedView, so we translate URL
  // params → the matching savedView on first render.
  const urlParams = useSearchParams();
  const initialSavedView = (() => {
    const overdue = urlParams.get("overdue");
    if (overdue === "true") return "overdue";
    const unassigned = urlParams.get("unassigned");
    if (unassigned === "true") return "unassigned";
    const type = urlParams.get("workflowType");
    // Accept any workflowType — built-in or custom:xxx. The chip
    // may not exist for it yet on first render (custom template list
    // hydrates after mount), but the filter still works.
    if (type) return type;
    return "all";
  })();
  const [savedView, setSavedView] = useState<string>(initialSavedView);
  // Assignee filter — drives the "Assignee" dropdown next to search.
  // Deep-linkable via ?assignedUserId=<uuid>.
  const initialAssignedUserId = urlParams.get("assignedUserId") ?? "";
  const [assignedUserId, setAssignedUserId] = useState<string>(initialAssignedUserId);
  const [assignableUsers, setAssignableUsers] = useState<Array<{ id: string; full_name: string; email: string; role: string }>>([]);
  const [orderBy, setOrderBy] = useState<"due_date" | "created_at" | "updated_at" | "priority">("due_date");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
  const [showNewModal, setShowNewModal] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const canOverride = ["admin", "director_of_sales", "market_leader"].includes(userRole);
  const [overriding, setOverriding] = useState<string | null>(null);
  // Admin-defined custom templates. Loaded once on mount and merged
  // into TYPE_META below so each custom workflow_type gets a real
  // display label (the template title) instead of falling back to
  // the raw "custom:xxx" key. Also drives the extra filter chips
  // at the top of the list.
  const [customTypes, setCustomTypes] = useState<{ workflow_type: string; title: string; category: string | null }[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function loadCustom() {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/workflow-templates", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      const rows: Array<{ workflow_type: string; title: string; category: string | null; is_custom: boolean; active: boolean }> = data.templates ?? [];
      setCustomTypes(
        rows
          .filter((t) => t.is_custom && t.active && t.workflow_type.startsWith("custom:"))
          .map((t) => ({ workflow_type: t.workflow_type, title: t.title, category: t.category ?? null })),
      );
    }
    loadCustom();
    return () => { cancelled = true; };
  }, []);
  // Runtime-merged type metadata — built-ins from the module TYPE_META
  // + every custom template we fetched. Used for row labels and the
  // saved-view chip row.
  const mergedTypeMeta = useMemo(() => {
    const map: Record<string, { label: string; icon: typeof Package; team: string }> = { ...TYPE_META };
    for (const t of customTypes) {
      map[t.workflow_type] = { label: t.title, icon: Package, team: "custom" };
    }
    return map;
  }, [customTypes]);

  const filters = useMemo(
    () => filtersForView(savedView, search, assignedUserId),
    [savedView, search, assignedUserId],
  );

  // Populate the Assignee dropdown from /api/sales/users. Same endpoint
  // the New Workflow modal uses to list who a workflow can be assigned
  // to, so the roster is guaranteed consistent.
  useEffect(() => {
    let cancelled = false;
    async function loadUsers() {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/sales/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok || cancelled) return;
      const users: Array<{ id: string; full_name: string; email: string; role: string }> = await res.json();
      setAssignableUsers(
        [...users].sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
      );
    }
    loadUsers();
    return () => { cancelled = true; };
  }, []);

  // We snapshot Date.now() at fetch time and thread it down into row
  // renders. This keeps the render pass pure (React 19 purity rule)
  // while still giving accurate "5m ago" / "3d overdue" labels.
  const [nowMs, setNowMs] = useState(0);

  // Fetch role once so the row-level "Mark Paid" quick action can
  // render for admin/DOS/market_leader only.
  useEffect(() => {
    async function loadRole() {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/sales/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const users: { id: string; role: string }[] = await res.json();
        const me = users.find((u) => u.id === session.user.id);
        if (me) setUserRole(me.role);
      }
    }
    loadRole();
  }, []);

  async function markPaid(workflowId: string, workflowNumber: string) {
    const reason = window.prompt(
      `Mark ${workflowNumber} as paid?\n\nReason (audit-logged, required):`,
      "Payment received off-platform",
    );
    if (!reason || !reason.trim()) return;
    setOverriding(workflowId);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/workflows/${workflowId}/payment-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ payment_status: "paid", reason: reason.trim() }),
      });
      if (res.ok) {
        // Force list refetch by toggling filters (small no-op that triggers useEffect).
        setWorkflows((prev) => prev.map((w) =>
          w.id === workflowId
            ? { ...w, overall_status: w.overall_status === "pending_payment" ? "in_progress" : w.overall_status }
            : w,
        ));
      } else {
        const err = await res.json().catch(() => ({}));
        window.alert(`Override failed: ${err.error ?? "Unknown"}`);
      }
    } finally {
      setOverriding(null);
    }
  }

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
      if (filters.assignedUserId) qs.set("assignedUserId", filters.assignedUserId);
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
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            New Workflow
          </button>
          {/* Backfill jump — admin-only. Endpoint auth is stricter
              (getAdminUserId) so this button only surfaces for the
              role that can actually use it. */}
          {userRole === "admin" && (
            <Link
              href="/admin/workflows/backfill"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
              title="Backfill workflows for legacy customers or paid location-services requests that never spawned"
            >
              <Package className="h-4 w-4" />
              Backfill
            </Link>
          )}
        </div>
      </div>

      {showNewModal && (
        <NewWorkflowModal
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => {
            setShowNewModal(false);
            window.location.href = `/sales/workflows/${id}`;
          }}
        />
      )}

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
        {/* Custom template types get their own chip row. Rendered
            after built-ins so the layout order stays predictable
            and grouped. */}
        {customTypes.length > 0 && (
          <>
            <div className="w-px h-6 bg-gray-200 mx-1" />
            {customTypes.map((t) => (
              <SavedViewChip
                key={t.workflow_type}
                label={t.title}
                active={savedView === t.workflow_type}
                onClick={() => setSavedView(t.workflow_type)}
              />
            ))}
          </>
        )}
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
        {/* Assignee dropdown. Filters both the primary_owner column
            and any active workflow_assignments collaborator on the
            server, so picking a person catches every workflow they
            own OR collaborate on. */}
        <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            className="bg-transparent focus:outline-none"
            aria-label="Filter by assignee"
          >
            <option value="">All assignees</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
          {assignedUserId && (
            <button
              type="button"
              onClick={() => setAssignedUserId("")}
              className="text-gray-400 hover:text-gray-700"
              aria-label="Clear assignee filter"
              title="Clear assignee filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
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
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                  <Loader2 className="inline-block h-5 w-5 animate-spin mr-2" />
                  Loading workflows…
                </td>
              </tr>
            ) : workflows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                  <Filter className="inline-block h-5 w-5 mr-2 text-gray-400" />
                  No workflows match the current filters.
                </td>
              </tr>
            ) : (
              workflows.map((w) => (
                <WorkflowRowRender
                  key={w.id}
                  workflow={w}
                  nowMs={nowMs}
                  canOverride={canOverride}
                  overriding={overriding === w.id}
                  onMarkPaid={() => markPaid(w.id, w.workflow_number)}
                  typeMeta={mergedTypeMeta}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkflowRowRender({
  workflow,
  nowMs,
  canOverride,
  overriding,
  onMarkPaid,
  typeMeta,
}: {
  workflow: WorkflowRow;
  nowMs: number;
  canOverride: boolean;
  overriding: boolean;
  onMarkPaid: () => void;
  typeMeta: Record<string, { label: string; icon: typeof Package; team: string }>;
}) {
  // Prefer the merged map (built-ins + admin's custom templates) so
  // custom-type rows render with the template's actual title rather
  // than the ugly "custom:xxx" fallback.
  const meta = typeMeta[workflow.workflow_type]
    ?? TYPE_META[workflow.workflow_type]
    ?? { label: humanizeCustomType(workflow.workflow_type), icon: Package, team: "" };
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
        <div className="text-sm font-medium text-gray-900">
          {workflow.customer_name ?? workflow.customer_email ?? <span className="text-gray-400">—</span>}
        </div>
        {workflow.customer_email && workflow.customer_name && (
          <div className="text-xs text-gray-500 truncate max-w-[200px]">{workflow.customer_email}</div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
        </div>
      </td>
      <td className="px-4 py-3">
        {workflow.assigned_user_id_effective ? (
          <>
            <div className="text-sm font-medium text-gray-900">
              {workflow.assigned_user_name ?? workflow.assigned_user_email ?? "—"}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              {workflow.assigned_user_role && workflow.assigned_user_role !== "primary_owner" && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 uppercase tracking-wide">
                  {workflow.assigned_user_role.replace(/_/g, " ")}
                </span>
              )}
              {workflow.assigned_user_email && workflow.assigned_user_name && (
                <span className="text-xs text-gray-500 truncate max-w-[180px]">{workflow.assigned_user_email}</span>
              )}
            </div>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
            Unassigned
          </span>
        )}
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
        <div className="flex items-center gap-2">
          <StatusBadge status={workflow.overall_status} label={status.label} className={status.badge} />
          {canOverride && workflow.overall_status === "pending_payment" && (
            <button
              type="button"
              onClick={onMarkPaid}
              disabled={overriding}
              className="text-xs text-emerald-700 hover:underline disabled:opacity-50 whitespace-nowrap"
              title="Mark payment received (audit-logged with your name + reason)"
            >
              {overriding ? "…" : "Mark paid"}
            </button>
          )}
        </div>
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

interface CustomerHit { id: string; full_name: string | null; email: string | null; role: string | null; }

interface TemplateOption { workflow_type: string; title: string; category: string | null; is_custom: boolean; }

function NewWorkflowModal({ onClose, onCreated }: { onClose: () => void; onCreated: (workflowId: string) => void }) {
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerHit[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerHit | null>(null);
  // "Internal task" mode — swaps the customer picker for a team-member
  // picker so admin can create workflows for perpetual internal work
  // (Cold Calling, Account Management, Operator Coaching, etc.). On
  // submit, both customer_id and assigned_user_id are set to the
  // picked rep so it shows up under both their assigned-workflow list
  // AND their personal /account/workflows page.
  const [isInternal, setIsInternal] = useState(false);
  const [staffList, setStaffList] = useState<CustomerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [workflowType, setWorkflowType] = useState<string>("ai_machine_fulfillment");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);

  useEffect(() => {
    // Pull custom templates so the dropdown includes admin-created
    // perpetual-task types (Account Management, Cold Calling, etc.).
    // Built-in templates are hard-coded in the fallback list below and
    // rendered even if this fetch fails or returns nothing.
    async function loadTemplates() {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/workflow-templates", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(
          (data.templates ?? [])
            .filter((t: { active: boolean }) => t.active)
            .map((t: TemplateOption) => ({
              workflow_type: t.workflow_type,
              title: t.title,
              category: t.category,
              is_custom: t.is_custom,
            })),
        );
      }
    }
    loadTemplates();
  }, []);
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only fetch (and only mutate state) when there's actually a query
  // worth running. Clearing on empty/selected happens inline in the
  // callbacks that change those, not here — this keeps the effect free
  // of setState in its main body.
  // Load the sales team once when Internal mode is first turned on.
  useEffect(() => {
    if (!isInternal || staffList.length > 0) return;
    async function loadStaff() {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/sales/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const rows: { id: string; full_name: string | null; email: string; role: string }[] = await res.json();
        setStaffList(rows.map((r) => ({ id: r.id, full_name: r.full_name, email: r.email, role: r.role })));
      }
    }
    loadStaff();
  }, [isInternal, staffList.length]);

  const shouldSearch = !selectedCustomer && !isInternal && customerQuery.trim().length >= 2;
  useEffect(() => {
    if (!shouldSearch) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setSearching(false); return; }
      const res = await fetch(
        `/api/workflows/customer-search?q=${encodeURIComponent(customerQuery.trim())}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (res.ok && !cancelled) {
        const json = await res.json();
        setCustomerResults(json.results ?? []);
      }
      if (!cancelled) setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [customerQuery, shouldSearch]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) { setError("Pick a customer first"); return; }
    setSubmitting(true);
    setError(null);
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setSubmitting(false); return; }

    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        customerId: selectedCustomer.id,
        // Internal tasks — auto-assign to the same rep who "owns" the
        // work so it appears in their /sales/workflows queue and their
        // load bumps on /sales/workload immediately.
        assignedUserId: isInternal ? selectedCustomer.id : undefined,
        workflowType,
        productName: productName || undefined,
        quantityPurchased: Number(quantity) || 1,
        // Noon UTC (not midnight) so the date the admin picked
        // renders as the same calendar day in every timezone. Midnight
        // UTC would flip to the previous day for anyone west of UTC
        // when the workflow detail page runs `.toLocaleDateString()`.
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00.000Z`).toISOString() : undefined,
        priority,
        description: notes || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.workflow?.id) {
      // Dump the DB trace to the browser console so we can debug why
      // template stages aren't propagating without adding UI. Open
      // DevTools → Console after creating a workflow to see it.
      if (json.debugTrace) {
        console.group("[workflow spawn debug]");
        console.log("Input workflowType sent by modal:", json.debugTrace.inputWorkflowType);
        console.log("Workflow row created:", json.debugTrace.workflowRow);
        console.log("All templates in DB for that workflow_type:", json.debugTrace.allTemplatesForThisType);
        console.log("Which template resolveTemplate would pick:", json.debugTrace.resolveTemplateWouldReturn);
        console.log(
          `Template stages in DB (for the linked/resolved template): ${json.debugTrace.templateStagesInDb.length}`,
          json.debugTrace.templateStagesInDb,
        );
        console.log(
          `Workflow stages actually inserted: ${json.debugTrace.workflowStagesInDb.length}`,
          json.debugTrace.workflowStagesInDb,
        );
        console.groupEnd();
      }
      onCreated(json.workflow.id);
    } else {
      setError(json.error ?? "Failed to create workflow");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl mt-16 mb-8">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Create workflow</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {/* Internal-task toggle — swap the customer picker for a
              team-member picker so admins can create perpetual-work
              workflows (Cold Calling, Account Management, etc.) where
              the assignee IS the "customer" and it shows up on both
              their /sales/workflows queue and their /account/workflows
              page. */}
          <label className="flex items-center gap-2 text-sm bg-gray-50 rounded-md px-3 py-2 border border-gray-200">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => {
                setIsInternal(e.target.checked);
                setSelectedCustomer(null);
                setCustomerQuery("");
                setCustomerResults([]);
              }}
            />
            <span>
              <span className="font-medium text-gray-900">Internal task</span>
              <span className="text-gray-500"> — assign to a team member (e.g. Cold Calling, Account Management)</span>
            </span>
          </label>

          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">
              {isInternal ? "Team member" : "Customer"}
            </label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium text-emerald-900">{selectedCustomer.full_name ?? selectedCustomer.email}</div>
                  {selectedCustomer.email && selectedCustomer.full_name && (
                    <div className="text-xs text-emerald-700">
                      {selectedCustomer.email}{selectedCustomer.role ? ` · ${selectedCustomer.role.replace(/_/g, " ")}` : ""}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerQuery(""); }} className="text-xs text-emerald-700 hover:underline">
                  Change
                </button>
              </div>
            ) : isInternal ? (
              <select
                value=""
                onChange={(e) => {
                  const staff = staffList.find((s) => s.id === e.target.value);
                  if (staff) setSelectedCustomer(staff);
                }}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">Choose a team member…</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name ?? s.email} ({s.role})
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="text"
                  value={customerQuery}
                  onChange={(e) => {
                    setCustomerQuery(e.target.value);
                    if (e.target.value.trim().length < 2) setCustomerResults([]);
                  }}
                  placeholder="Search by name or email…"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                />
                {searching && <div className="text-xs text-gray-400 mt-1">Searching…</div>}
                {customerResults.length > 0 && (
                  <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-gray-100 divide-y divide-gray-100">
                    {customerResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerResults([]);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          <div className="font-medium text-gray-900">{c.full_name ?? c.email ?? c.id.slice(0, 8)}</div>
                          {c.email && <div className="text-xs text-gray-500">{c.email}{c.role ? ` • ${c.role}` : ""}</div>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Type</label>
              <select
                value={workflowType}
                onChange={(e) => setWorkflowType(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              >
                {/* All 6 built-in types render unconditionally — they
                    exist in code even before the first spawn creates
                    the DB row, so relying on the API alone would hide
                    any type that hasn't been used yet. */}
                <optgroup label="Built-in">
                  <option value="ai_machine_fulfillment">AI Machine Fulfillment</option>
                  <option value="location_services">Location Services</option>
                  <option value="financing">Financing</option>
                  <option value="coffee_equipment">Coffee Equipment</option>
                  <option value="coffee_service">Coffee Service</option>
                  <option value="website_build">Website Build</option>
                </optgroup>
                {/* Custom templates grouped by admin-assigned category.
                    Only appear when admin has created them via
                    /admin/workflows/templates. */}
                {Array.from(
                  new Set(
                    templates.filter((t) => t.is_custom).map((t) => t.category ?? "Uncategorized"),
                  ),
                ).map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {templates
                      .filter((t) => t.is_custom && (t.category ?? "Uncategorized") === cat)
                      .map((t) => (
                        <option key={t.workflow_type} value={t.workflow_type}>{t.title}</option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Product name (optional)</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. 5 × VendEra AI Machine"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <p className="text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
            The customer will receive an email confirming the workflow has been created.
          </p>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:text-gray-800 px-3 py-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedCustomer || submitting}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create workflow
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Fallback label for custom workflow types when the /api/admin/
 * workflow-templates fetch hasn't hydrated yet (or the row was
 * spawned from a since-deleted template). Turns "custom:cold_calling"
 * into "Cold Calling" so the row is still legible.
 */
function humanizeCustomType(workflowType: string): string {
  const bare = workflowType.startsWith("custom:") ? workflowType.slice("custom:".length) : workflowType;
  return bare
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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
