"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { SourceIntakePanel } from "@/app/components/SourceIntakePanel";
import {
  Loader2,
  ChevronLeft,
  MessageSquare,
  Truck,
  UserCircle2,
  Clock,
  Save,
  AlertTriangle,
  CheckCircle2,
  Pause,
  Ban,
  RotateCw,
  Calendar,
  Package,
  Eye,
  EyeOff,
  Mail,
  Phone,
  Trash2,
  Plus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface Stage {
  id: string;
  stage_key: string;
  stage_name: string;
  stage_order: number;
  stage_type: string;
  status: string;
  target_quantity: number | null;
  completed_quantity: number;
  customer_visible: boolean;
  required_for_completion: boolean;
  internal_notes: string | null;
  customer_message: string | null;
  version: number;
}
interface Note {
  id: string;
  visibility: "internal" | "customer";
  body: string;
  author_user_id: string | null;
  created_at: string;
}
interface Assignment {
  id: string;
  user_id: string;
  role: string;
  team: string | null;
  active: boolean;
  assigned_at: string;
  user_profile: { full_name: string | null; email: string | null } | null;
}
interface Shipment {
  id: string;
  carrier: string | null;
  tracking_number: string | null;
  quantity: number;
  ship_date: string | null;
  actual_delivery_date: string | null;
  notes: string | null;
}
interface OrderItem {
  id: string;
  external_order_id: string;
  order_number: string | null;
  order_total: number | null;
  fulfillment_status: string;
  fulfilled_at: string | null;
}
interface EventRow {
  id: string;
  event_type: string;
  previous_value: unknown;
  new_value: unknown;
  actor_user_id: string | null;
  actor_type: string;
  notes: string | null;
  created_at: string;
}
interface PlacementSummary {
  id: string;
  title: string;
  status: string;
  locations_needed: number;
  locations_filled: number;
  submissions_count: number;
  submissions_accepted: number;
  submissions_pending_admin: number;
}
interface CustomerInfo {
  id: string;
  full_name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
}
interface CompanyInfo {
  id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
}
interface DetailPayload {
  workflow: {
    id: string;
    workflow_number: string;
    workflow_type: string;
    title: string;
    description: string | null;
    product_name: string | null;
    quantity_purchased: number;
    quantity_completed: number;
    payment_status: string;
    overall_status: string;
    priority: string;
    start_date: string | null;
    due_date: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    assigned_user_id: string | null;
    primary_team: string | null;
    show_assignee_to_customer: boolean;
    metadata: Record<string, unknown>;
  };
  stages: Stage[];
  notes: Note[];
  assignments: Assignment[];
  shipments: Shipment[];
  orderItems: OrderItem[];
  events: EventRow[];
  placementSummary: PlacementSummary | null;
  customerInfo: CustomerInfo | null;
  companyInfo: CompanyInfo | null;
  assigneeDisplay: string | null;
  isStaffView: boolean;
  canDelete: boolean;
}

export default function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(`/api/workflows/${id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const j = (await res.json()) as DetailPayload;
      setData(j);
    } else if (res.status === 404) {
      setError("Workflow not found");
    } else if (res.status === 403) {
      setError("You don't have access to this workflow");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function withAuth(fn: (token: string) => Promise<Response>): Promise<Response | null> {
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return fn(session.access_token);
  }

  async function updateStageField(stageKey: string, patch: Record<string, unknown>) {
    setSaving(stageKey);
    try {
      const res = await withAuth((token) =>
        fetch(`/api/workflows/${id}/stages/${stageKey}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(patch),
        }),
      );
      if (!res || !res.ok) {
        const msg = res ? (await res.json()).error : "Auth failed";
        alert(`Update failed: ${msg}`);
      } else {
        await load();
      }
    } finally {
      setSaving(null);
    }
  }

  async function postAction(path: string, body: Record<string, unknown>) {
    const res = await withAuth((token) =>
      fetch(`/api/workflows/${id}${path}`, {
        method:
          path.includes("/deadline") ||
          path.includes("/status") ||
          path.includes("/order-items") ||
          path.includes("/payment-status")
            ? "PATCH"
            : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    );
    if (!res || !res.ok) {
      const msg = res ? (await res.json()).error : "Auth failed";
      alert(`Action failed: ${msg}`);
      return false;
    }
    await load();
    return true;
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="text-red-600">{error ?? "No data"}</div>
        <Link href="/sales/workflows" className="text-sm text-emerald-700 hover:underline mt-4 inline-block">
          ← Back to Workflows
        </Link>
      </div>
    );
  }

  const w = data.workflow;
  const totalPct = w.quantity_purchased > 0 ? Math.min(100, Math.round((w.quantity_completed / w.quantity_purchased) * 100)) : 0;
  const dueDelta = w.due_date ? Math.floor((new Date(w.due_date).getTime() - Date.now()) / 86400_000) : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/sales/workflows" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800">
          <ChevronLeft className="h-4 w-4" /> Back to Workflows
        </Link>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="font-mono text-xs text-gray-500">{w.workflow_number}</div>
              <StatusBadge status={w.overall_status} />
              <PriorityBadge priority={w.priority} />
            </div>
            {/* Customer identity — always shown above title so staff see
                who this workflow is for at a glance. */}
            {data.customerInfo && (
              <div className="mt-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <UserCircle2 className="h-5 w-5 text-gray-500" />
                <span>{data.customerInfo.full_name ?? data.customerInfo.email ?? "Customer"}</span>
                {data.companyInfo && (
                  <span className="text-sm font-normal text-gray-500">
                    · {data.companyInfo.business_name}
                  </span>
                )}
              </div>
            )}
            {data.customerInfo && (data.customerInfo.email || data.customerInfo.phone) && (
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                {data.customerInfo.email && (
                  <a
                    href={`mailto:${data.customerInfo.email}`}
                    className="inline-flex items-center gap-1 hover:text-emerald-700"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {data.customerInfo.email}
                  </a>
                )}
                {data.customerInfo.phone && (
                  <a
                    href={`tel:${data.customerInfo.phone}`}
                    className="inline-flex items-center gap-1 hover:text-emerald-700"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {data.customerInfo.phone}
                  </a>
                )}
                {data.customerInfo.role && (
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    {data.customerInfo.role.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            )}
            <h1 className="text-2xl font-semibold text-gray-900 mt-3">{w.title}</h1>
            {w.description && <p className="text-sm text-gray-600 mt-1">{w.description}</p>}
            {w.product_name && <p className="text-xs text-gray-500 mt-2">{w.product_name}</p>}
          </div>
          <div className="text-right">
            {w.quantity_purchased > 0 && (
              <div>
                <div className="text-3xl font-semibold text-gray-900">
                  {w.quantity_completed} <span className="text-gray-400">/ {w.quantity_purchased}</span>
                </div>
                <div className="text-xs uppercase tracking-wide text-gray-500 mt-1">complete</div>
                <div className="w-40 bg-gray-100 rounded-full h-2 mt-2">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${totalPct}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-4 gap-4 mt-6 text-sm">
          <InfoTile
            icon={<Calendar className="h-4 w-4" />}
            label="Due"
            value={
              w.due_date
                ? new Date(w.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "—"
            }
            hint={
              dueDelta != null
                ? dueDelta < 0
                  ? `${Math.abs(dueDelta)}d overdue`
                  : dueDelta === 0
                    ? "today"
                    : `${dueDelta}d remaining`
                : undefined
            }
          />
          <AssigneesTile
            assignments={data.assignments}
            assigneeDisplay={data.assigneeDisplay}
            currentUserId={w.assigned_user_id}
            team={w.primary_team}
            staffView={data.isStaffView}
            workflowId={id}
            onChanged={load}
          />
          <PaymentTile
            paymentStatus={w.payment_status}
            staffView={data.isStaffView}
            onOverride={(next, reason) =>
              postAction("/payment-status", { payment_status: next, reason })
            }
          />
          <InfoTile
            icon={<Clock className="h-4 w-4" />}
            label="Started"
            value={w.start_date ? new Date(w.start_date).toLocaleDateString() : "—"}
          />
        </div>

        {data.placementSummary && (
          <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm">
            <div className="font-medium text-emerald-900">
              Linked Placement Partner Contract: {data.placementSummary.title}
            </div>
            <div className="text-xs text-emerald-800 mt-1">
              {data.placementSummary.locations_filled} / {data.placementSummary.locations_needed} filled on marketplace •{" "}
              {data.placementSummary.submissions_count} submission{data.placementSummary.submissions_count !== 1 ? "s" : ""} •{" "}
              {data.placementSummary.submissions_accepted} accepted •{" "}
              {data.placementSummary.submissions_pending_admin} pending admin review
            </div>
          </div>
        )}
      </div>

      {/* Stages */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Stages</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {data.stages.map((stage) => (
            <StageRow
              key={stage.id}
              stage={stage}
              saving={saving === stage.stage_key}
              onUpdate={(patch) => updateStageField(stage.stage_key, patch)}
              staffView={data.isStaffView}
            />
          ))}
        </div>
      </div>

      {/* Source Intake — as-submitted customer data from the origin form.
          Snapshots into workflow.metadata.source_intake at spawn time so
          the person picking up this workflow sees the full context
          without clicking back to the source table. */}
      <SourceIntakePanel intake={(w.metadata as { source_intake?: unknown } | null)?.source_intake} />

      {/* Order items (coffee_service etc.) */}
      {data.orderItems.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Orders</h2>
            <p className="text-xs text-gray-500 mt-1">
              Individual orders attached to this workflow. Mark each fulfilled independently.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {data.orderItems.map((item) => (
              <div key={item.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {item.order_number ?? item.external_order_id.slice(0, 8)}
                    {item.order_total != null && (
                      <span className="text-gray-500 font-normal ml-2">${Number(item.order_total).toFixed(2)}</span>
                    )}
                  </div>
                  {item.fulfilled_at && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      Fulfilled {new Date(item.fulfilled_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
                {data.isStaffView && (
                  <select
                    value={item.fulfillment_status}
                    onChange={(e) => postAction(`/order-items/${item.id}`, { fulfillmentStatus: e.target.value })}
                    className="rounded-md border border-gray-200 text-sm px-2 py-1"
                  >
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="fulfilled">Fulfilled</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shipments */}
      {(data.shipments.length > 0 || data.isStaffView) && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Shipments</h2>
            {data.isStaffView && <AddShipmentButton workflowId={id} onSaved={load} />}
          </div>
          <div className="divide-y divide-gray-100">
            {data.shipments.length === 0 && (
              <div className="p-5 text-sm text-gray-500">No shipments yet.</div>
            )}
            {data.shipments.map((s) => (
              <div key={s.id} className="p-4 text-sm">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-gray-500" />
                  <span className="font-medium text-gray-900">{s.carrier ?? "Unknown carrier"}</span>
                  {s.tracking_number && (
                    <span className="text-xs text-gray-500 font-mono">{s.tracking_number}</span>
                  )}
                  <span className="ml-auto text-xs text-gray-500">Qty {s.quantity}</span>
                </div>
                {s.notes && <div className="text-xs text-gray-600 mt-1">{s.notes}</div>}
                <div className="text-xs text-gray-400 mt-1">
                  {s.ship_date ? `Shipped ${new Date(s.ship_date).toLocaleDateString()}` : "No ship date"}
                  {s.actual_delivery_date && ` • Delivered ${new Date(s.actual_delivery_date).toLocaleDateString()}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Notes &amp; Customer Updates</h2>
        </div>
        {data.isStaffView && <AddNoteForm workflowId={id} onSaved={load} />}
        <div className="divide-y divide-gray-100">
          {data.notes.length === 0 && (
            <div className="p-5 text-sm text-gray-500">No notes yet.</div>
          )}
          {data.notes.map((n) => (
            <div key={n.id} className="p-4">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                {n.visibility === "customer" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                    <Eye className="h-3 w-3" /> Customer-visible
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-gray-500 font-medium">
                    <EyeOff className="h-3 w-3" /> Internal
                  </span>
                )}
                <span>•</span>
                <span>{new Date(n.created_at).toLocaleString()}</span>
              </div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{n.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Event history (staff only) */}
      {data.isStaffView && data.events.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Activity</h2>
          </div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {data.events.map((e) => (
              <div key={e.id} className="p-3 text-xs text-gray-600">
                <span className="font-medium text-gray-800">{e.event_type.replace(/_/g, " ")}</span>
                <span className="text-gray-400 mx-2">•</span>
                <span>{new Date(e.created_at).toLocaleString()}</span>
                {e.notes && <div className="text-gray-500 mt-0.5">{e.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin actions */}
      {data.isStaffView && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 flex flex-wrap gap-3">
          <AdminActions
            workflowId={id}
            workflowNumber={w.workflow_number}
            status={w.overall_status}
            canDelete={data.canDelete}
            onDone={load}
            onDeleted={() => router.push("/sales/workflows")}
          />
        </div>
      )}
    </div>
  );
}

function StageRow({
  stage,
  onUpdate,
  saving,
  staffView,
}: {
  stage: Stage;
  onUpdate: (patch: Record<string, unknown>) => Promise<void>;
  saving: boolean;
  staffView: boolean;
}) {
  // Adjust-state-when-a-prop-changes pattern (React 19). Snapshot the
  // last-seen persisted values; when the parent supplies a new stage
  // row, reset the drafts inline. Avoids the useEffect+setState
  // anti-pattern flagged by react-hooks/set-state-in-effect.
  const [lastSeen, setLastSeen] = useState({
    completed_quantity: stage.completed_quantity,
    internal_notes: stage.internal_notes ?? "",
    customer_message: stage.customer_message ?? "",
    stage_name: stage.stage_name,
  });
  const [qtyDraft, setQtyDraft] = useState(String(stage.completed_quantity));
  const [notesDraft, setNotesDraft] = useState(stage.internal_notes ?? "");
  const [customerDraft, setCustomerDraft] = useState(stage.customer_message ?? "");
  const [nameDraft, setNameDraft] = useState(stage.stage_name);

  if (
    lastSeen.completed_quantity !== stage.completed_quantity ||
    lastSeen.internal_notes !== (stage.internal_notes ?? "") ||
    lastSeen.customer_message !== (stage.customer_message ?? "") ||
    lastSeen.stage_name !== stage.stage_name
  ) {
    setLastSeen({
      completed_quantity: stage.completed_quantity,
      internal_notes: stage.internal_notes ?? "",
      customer_message: stage.customer_message ?? "",
      stage_name: stage.stage_name,
    });
    setQtyDraft(String(stage.completed_quantity));
    setNotesDraft(stage.internal_notes ?? "");
    setCustomerDraft(stage.customer_message ?? "");
    setNameDraft(stage.stage_name);
  }

  const isQuantity = stage.stage_type === "quantity";
  const target = stage.target_quantity ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((stage.completed_quantity / target) * 100)) : 0;

  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <StageStatusIcon status={stage.status} />
            {staffView ? (
              // Inline rename — template edits don't propagate to
              // spawned workflows, so admins need to fix "New Stage"
              // holdovers here. Auto-saves on blur; empty values are
              // rejected server-side.
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  const trimmed = nameDraft.trim();
                  if (trimmed.length === 0) {
                    // Refuse empty — snap back to persisted name.
                    setNameDraft(stage.stage_name);
                    return;
                  }
                  if (trimmed !== stage.stage_name) {
                    onUpdate({ stageName: trimmed });
                  }
                }}
                className="font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-500 focus:outline-none px-1 -mx-1 rounded-none min-w-[10rem]"
                placeholder="Stage name"
                title="Click to rename this stage"
              />
            ) : (
              <span className="font-medium text-gray-900">{stage.stage_name}</span>
            )}
            {stage.required_for_completion && (
              <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                Required
              </span>
            )}
            {!stage.customer_visible && staffView && (
              <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                Internal
              </span>
            )}
          </div>
          {isQuantity && (
            <div className="mt-2 flex items-center gap-3 text-sm">
              <span className="text-gray-500">
                {stage.completed_quantity} of {target}
              </span>
              <div className="flex-1 max-w-xs bg-gray-100 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-gray-400">{pct}%</span>
            </div>
          )}
        </div>
        {staffView && (
          <div className="flex items-center gap-2">
            {isQuantity && (
              <>
                <input
                  type="number"
                  min={0}
                  value={qtyDraft}
                  onChange={(e) => setQtyDraft(e.target.value)}
                  className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm text-right"
                />
                <button
                  type="button"
                  disabled={saving || qtyDraft === String(stage.completed_quantity)}
                  onClick={() => onUpdate({ completedQuantity: Number(qtyDraft) })}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-3 py-1 text-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </button>
              </>
            )}
            <select
              value={stage.status}
              onChange={(e) => onUpdate({ status: e.target.value })}
              disabled={saving}
              className="rounded-md border border-gray-200 text-sm px-2 py-1"
            >
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
        )}
      </div>
      {staffView && (
        <div className="mt-3 grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">
              Internal note
              <span className="text-gray-400 normal-case font-normal ml-2">auto-saves on blur</span>
            </label>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if (notesDraft !== (stage.internal_notes ?? "")) {
                  onUpdate({ internalNotes: notesDraft });
                }
              }}
              rows={2}
              className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm resize-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-emerald-700 mb-1">
              Customer message
              <span className="text-emerald-600/60 normal-case font-normal ml-2">auto-saves on blur</span>
            </label>
            <textarea
              value={customerDraft}
              onChange={(e) => setCustomerDraft(e.target.value)}
              onBlur={() => {
                if (customerDraft !== (stage.customer_message ?? "")) {
                  onUpdate({ customerMessage: customerDraft });
                }
              }}
              rows={2}
              className="w-full rounded-md border border-emerald-200 bg-emerald-50/50 px-2 py-1 text-sm resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StageStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "in_progress") return <Loader2 className="h-4 w-4 text-emerald-600" />;
  if (status === "blocked") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  if (status === "skipped") return <Ban className="h-4 w-4 text-gray-400" />;
  return <Clock className="h-4 w-4 text-gray-400" />;
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  const cls = status === "completed"
    ? "bg-emerald-100 text-emerald-800"
    : status === "overdue"
      ? "bg-red-100 text-red-800"
      : status === "cancelled"
        ? "bg-gray-100 text-gray-500 line-through"
        : status === "on_hold"
          ? "bg-yellow-100 text-yellow-800"
          : status === "at_risk"
            ? "bg-amber-100 text-amber-800"
            : "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "normal" || !priority) return null;
  const cls = priority === "urgent"
    ? "bg-red-100 text-red-800"
    : priority === "high"
      ? "bg-orange-100 text-orange-800"
      : "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase ${cls}`}>
      {priority}
    </span>
  );
}

interface StaffPicker { id: string; full_name: string | null; email: string; role: string }

/**
 * Multi-assignee tile — shows the primary owner + every collaborator,
 * each with a remove button. Also exposes an inline picker to add
 * another team member as a collaborator, or to set a new primary
 * owner (when Reassign is clicked).
 *
 * Every add/remove hits the shared /assign endpoint and its
 * DELETE?assignmentId variant, then calls onChanged() so the parent
 * re-fetches and re-renders with the fresh list.
 */
function AssigneesTile({
  assignments,
  assigneeDisplay,
  currentUserId,
  team,
  staffView,
  workflowId,
  onChanged,
}: {
  assignments: Assignment[];
  assigneeDisplay: string | null;
  currentUserId: string | null;
  team: string | null;
  staffView: boolean;
  workflowId: string;
  onChanged: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<null | "primary" | "collaborator">(null);
  const [staff, setStaff] = useState<StaffPicker[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function openPicker(next: "primary" | "collaborator") {
    setMode(next);
    if (staff.length > 0) return;
    setLoadingStaff(true);
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const res = await fetch("/api/sales/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setStaff(await res.json());
    }
    setLoadingStaff(false);
  }

  async function withAuth<T>(fn: (token: string) => Promise<T>): Promise<T | null> {
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return fn(session.access_token);
  }

  async function pickUser(userId: string) {
    if (!mode) return;
    setBusy(userId);
    const body = mode === "primary"
      ? { userId, role: "primary_owner", makePrimary: true }
      : { userId, role: "observer" };
    const res = await withAuth((token) =>
      fetch(`/api/workflows/${workflowId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    );
    setBusy(null);
    if (res && res.ok) {
      setMode(null);
      await onChanged();
    } else if (res) {
      const err = await res.json().catch(() => ({}));
      alert(`Failed: ${err.error ?? "Unknown"}`);
    }
  }

  async function removeAssignment(assignmentId: string) {
    if (!window.confirm("Remove this assignment?")) return;
    setBusy(assignmentId);
    const res = await withAuth((token) =>
      fetch(`/api/workflows/${workflowId}/assign?assignmentId=${assignmentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    setBusy(null);
    if (res && res.ok) {
      await onChanged();
    } else if (res) {
      const err = await res.json().catch(() => ({}));
      alert(`Failed: ${err.error ?? "Unknown"}`);
    }
  }

  // Show only active rows. Sort primary_owner first so the tile has a
  // clear header person.
  const active = [...assignments]
    .filter((a) => a.active)
    .sort((a, b) => {
      if (a.role === "primary_owner" && b.role !== "primary_owner") return -1;
      if (b.role === "primary_owner" && a.role !== "primary_owner") return 1;
      return a.assigned_at.localeCompare(b.assigned_at);
    });

  // Prevent the picker from suggesting people already on the list.
  const assignedUserIds = new Set(active.map((a) => a.user_id));
  const pickable = staff.filter((s) => !assignedUserIds.has(s.id));

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 flex items-center gap-1">
        <UserCircle2 className="h-4 w-4" /> Assigned{active.length > 1 ? ` (${active.length})` : ""}
      </div>

      {active.length === 0 ? (
        <div className="text-sm font-medium text-gray-900 mt-1">
          {assigneeDisplay ?? "Unassigned"}
        </div>
      ) : (
        <div className="mt-1 space-y-1">
          {active.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {a.user_profile?.full_name ?? a.user_profile?.email ?? a.user_id.slice(0, 8)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">
                  {a.role.replace(/_/g, " ")}
                </div>
              </div>
              {staffView && (
                <button
                  type="button"
                  onClick={() => removeAssignment(a.id)}
                  disabled={busy === a.id}
                  className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                  title="Remove this assignment"
                >
                  {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {team && <div className="text-xs text-gray-500 mt-1.5">Team: {team}</div>}

      {staffView && !mode && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <button
            type="button"
            onClick={() => openPicker("primary")}
            className="text-emerald-700 hover:underline"
          >
            {currentUserId ? "Reassign primary" : "Set primary"}
          </button>
          <button
            type="button"
            onClick={() => openPicker("collaborator")}
            className="text-emerald-700 hover:underline inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add collaborator
          </button>
        </div>
      )}

      {staffView && mode && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
            {mode === "primary" ? "Set primary owner" : "Add collaborator"}
          </div>
          {loadingStaff ? (
            <div className="text-xs text-gray-500 inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading team…
            </div>
          ) : (
            <>
              <select
                onChange={(e) => e.target.value && pickUser(e.target.value)}
                defaultValue=""
                disabled={busy !== null}
                className="w-full rounded-md border border-gray-200 text-xs px-2 py-1"
              >
                <option value="" disabled>Select team member…</option>
                {pickable.length === 0 ? (
                  <option value="" disabled>Everyone is already on this workflow</option>
                ) : (
                  pickable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name ?? s.email} ({s.role})
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => setMode(null)}
                className="mt-1 text-xs text-gray-500 hover:text-gray-800"
                disabled={busy !== null}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentTile({
  paymentStatus,
  staffView,
  onOverride,
}: {
  paymentStatus: string;
  staffView: boolean;
  onOverride: (next: string, reason: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState(paymentStatus);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!reason.trim()) return;
    setSaving(true);
    const ok = await onOverride(next, reason.trim());
    setSaving(false);
    if (ok) { setEditing(false); setReason(""); }
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 flex items-center gap-1">
        <Package className="h-4 w-4" /> Payment
      </div>
      <div className="text-sm font-medium text-gray-900 mt-1 capitalize">
        {paymentStatus.replace(/_/g, " ")}
      </div>
      {staffView && !editing && (
        <button
          type="button"
          onClick={() => { setNext(paymentStatus); setEditing(true); }}
          className="mt-2 text-xs text-emerald-700 hover:underline"
        >
          Override
        </button>
      )}
      {staffView && editing && (
        <div className="mt-2 space-y-2">
          <select
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-gray-200 text-xs px-2 py-1"
          >
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="refunded">Refunded</option>
            <option value="na">N/A</option>
          </select>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (audit-logged)"
            disabled={saving}
            className="w-full rounded-md border border-gray-200 text-xs px-2 py-1"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setEditing(false); setReason(""); }}
              disabled={saving}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || !reason.trim() || next === paymentStatus}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-2 py-1 text-xs disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoTile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-sm font-medium text-gray-900 mt-1 capitalize">{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function AddNoteForm({ workflowId, onSaved }: { workflowId: string; onSaved: () => void }) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "customer">("internal");
  const [posting, setPosting] = useState(false);

  async function submit() {
    if (!body.trim()) return;
    setPosting(true);
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setPosting(false);
      return;
    }
    const res = await fetch(`/api/workflows/${workflowId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ body: body.trim(), visibility }),
    });
    if (res.ok) {
      setBody("");
      onSaved();
    } else {
      const err = await res.json();
      alert(`Failed: ${err.error}`);
    }
    setPosting(false);
  }

  return (
    <div className="p-4 border-b border-gray-100 bg-gray-50/50">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Write a note…"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setVisibility("internal")}
            className={`px-2.5 py-1 rounded ${visibility === "internal" ? "bg-gray-800 text-white" : "bg-white text-gray-600 border"}`}
          >
            <EyeOff className="inline h-3 w-3 mr-1" /> Internal
          </button>
          <button
            type="button"
            onClick={() => setVisibility("customer")}
            className={`px-2.5 py-1 rounded ${visibility === "customer" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 border"}`}
          >
            <Eye className="inline h-3 w-3 mr-1" /> Customer-visible
          </button>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() || posting}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {posting ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
          Post
        </button>
      </div>
    </div>
  );
}

function AddShipmentButton({ workflowId, onSaved }: { workflowId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [qty, setQty] = useState("1");
  const [posting, setPosting] = useState(false);

  async function submit() {
    setPosting(true);
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setPosting(false);
      return;
    }
    const res = await fetch(`/api/workflows/${workflowId}/shipments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        carrier: carrier || undefined,
        trackingNumber: tracking || undefined,
        quantity: Number(qty) || 1,
        shipDate: new Date().toISOString(),
      }),
    });
    if (res.ok) {
      setCarrier(""); setTracking(""); setQty("1"); setOpen(false); onSaved();
    } else {
      const err = await res.json();
      alert(`Failed: ${err.error}`);
    }
    setPosting(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-emerald-700 hover:underline"
      >
        + Add shipment
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Carrier" className="rounded-md border border-gray-200 px-2 py-1 text-sm" />
      <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking #" className="rounded-md border border-gray-200 px-2 py-1 text-sm" />
      <input value={qty} type="number" min={1} onChange={(e) => setQty(e.target.value)} className="w-16 rounded-md border border-gray-200 px-2 py-1 text-sm" />
      <button type="button" disabled={posting} onClick={submit} className="rounded-md bg-emerald-600 text-white px-3 py-1 text-sm">
        {posting ? "…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500">Cancel</button>
    </div>
  );
}

function AdminActions({
  workflowId,
  workflowNumber,
  status,
  canDelete,
  onDone,
  onDeleted,
}: {
  workflowId: string;
  workflowNumber: string;
  status: string;
  canDelete: boolean;
  onDone: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function submit(path: string, method: string, body: Record<string, unknown>) {
    const reason = window.prompt("Reason (audit-logged):");
    if (!reason) return;
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(`/api/workflows/${workflowId}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...body, reason }),
    });
    if (res.ok) onDone();
    else alert(`Failed: ${(await res.json()).error}`);
  }

  async function handleDelete() {
    // Two-step confirm because the delete cascades every stage, note,
    // shipment, order-item, event, and pending approval — irreversible.
    const confirmed = window.confirm(
      `Permanently delete workflow ${workflowNumber}?\n\n` +
      `This removes every stage, note, shipment, order item, event, and pending approval. ` +
      `Time entries stay but lose their workflow link. Prefer Cancel over Delete for real customer work.`,
    );
    if (!confirmed) return;
    const reason = window.prompt(
      `Reason (audit-logged, required):`,
      "Test/duplicate workflow cleanup",
    );
    if (!reason || !reason.trim()) return;

    setDeleting(true);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (res.ok) {
        onDeleted();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Delete failed: ${err.error ?? "Unknown"}`);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => submit("/status", "PATCH", { overallStatus: "on_hold" })}
        className="inline-flex items-center gap-1.5 rounded-md border border-yellow-200 bg-yellow-50 text-yellow-800 px-3 py-1.5 text-sm hover:bg-yellow-100"
      >
        <Pause className="h-3.5 w-3.5" /> Put on hold
      </button>
      <button
        type="button"
        onClick={() => {
          const iso = window.prompt("New due date (YYYY-MM-DD):");
          if (!iso) return;
          const dt = new Date(`${iso}T00:00:00.000Z`);
          if (isNaN(dt.getTime())) { alert("Invalid date"); return; }
          submit("/deadline", "PATCH", { newDueDate: dt.toISOString() });
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white text-gray-700 px-3 py-1.5 text-sm hover:bg-gray-50"
      >
        <Calendar className="h-3.5 w-3.5" /> Change deadline
      </button>
      {status !== "cancelled" && status !== "completed" && (
        <button
          type="button"
          onClick={() => submit("/cancel", "POST", {})}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white text-red-700 px-3 py-1.5 text-sm hover:bg-red-50"
        >
          <Ban className="h-3.5 w-3.5" /> Cancel workflow
        </button>
      )}
      {(status === "cancelled" || status === "completed") && (
        <button
          type="button"
          onClick={() => submit("/reopen", "POST", {})}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white text-gray-700 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          <RotateCw className="h-3.5 w-3.5" /> Reopen
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-600 text-white px-3 py-1.5 text-sm hover:bg-red-700 disabled:opacity-50"
          title="Permanently delete this workflow and all its children (admin only)"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Delete
        </button>
      )}
    </>
  );
}
