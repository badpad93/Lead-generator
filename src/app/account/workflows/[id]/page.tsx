"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import {
  ChevronLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Truck,
  Package,
  AlertTriangle,
  Ban,
  Calendar,
  UserCircle2,
} from "lucide-react";

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
  customer_message: string | null;
}
interface Note {
  id: string;
  visibility: "internal" | "customer";
  body: string;
  created_at: string;
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
  order_number: string | null;
  order_total: number | null;
  fulfillment_status: string;
  fulfilled_at: string | null;
  created_at: string;
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
    overall_status: string;
    start_date: string | null;
    due_date: string | null;
    completed_at: string | null;
    primary_team: string | null;
  };
  stages: Stage[];
  notes: Note[];
  shipments: Shipment[];
  orderItems: OrderItem[];
  assigneeDisplay: string | null;
}

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_payment: "Pending payment",
  ready_to_begin: "Ready to begin",
  not_started: "Not started yet",
  in_progress: "In progress",
  waiting_on_customer: "Action needed from you",
  waiting_on_vendor: "Waiting on vendor",
  on_hold: "On hold",
  at_risk: "Attention needed",
  overdue: "Delayed",
  completed: "Complete",
  cancelled: "Cancelled",
  refunded: "Refunded",
  expired: "Expired",
};

export default function MyWorkflowDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/workflows/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setData(await res.json());
      } else if (res.status === 403 || res.status === 404) {
        setError("This order isn't available or you don't have access.");
      }
      setNowMs(Date.now());
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">
        <Loader2 className="inline h-5 w-5 animate-spin mr-2" />Loading…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="text-gray-700 font-medium">{error ?? "No data"}</div>
        <Link href="/account/workflows" className="text-sm text-blue-700 hover:underline mt-4 inline-block">
          ← Back to My Order Status
        </Link>
      </div>
    );
  }

  const w = data.workflow;
  const total = Number(w.quantity_purchased);
  const done = Number(w.quantity_completed);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const isComplete = w.overall_status === "completed";
  const isDelayed = w.overall_status === "overdue" || w.overall_status === "at_risk";
  const isCancelled = w.overall_status === "cancelled";
  const daysDelta = w.due_date && nowMs !== 0
    ? Math.floor((new Date(w.due_date).getTime() - nowMs) / 86400_000)
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link href="/account/workflows" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ChevronLeft className="h-4 w-4" /> Back to My Order Status
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">{w.title}</h1>
        {w.product_name && <p className="text-sm text-gray-500 mt-1">{w.product_name}</p>}

        <div className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
          isComplete ? "bg-emerald-100 text-emerald-800"
          : isDelayed ? "bg-amber-100 text-amber-800"
          : isCancelled ? "bg-gray-100 text-gray-500"
          : "bg-blue-100 text-blue-800"
        }`}>
          {isComplete ? <CheckCircle2 className="h-4 w-4" />
            : isDelayed ? <AlertTriangle className="h-4 w-4" />
            : isCancelled ? <Ban className="h-4 w-4" />
            : <Clock className="h-4 w-4" />}
          {CUSTOMER_STATUS_LABELS[w.overall_status] ?? w.overall_status}
        </div>

        {total > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm text-gray-700 mb-2">
              <span className="font-medium">{done} of {total} {done === 1 ? "unit" : "units"} complete</span>
              <span className="text-gray-500">{pct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${isComplete ? "bg-emerald-500" : "bg-blue-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 text-sm">
          {w.due_date && (
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Estimated completion">
              {new Date(w.due_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              {daysDelta != null && !isComplete && (
                <div className={`text-xs mt-0.5 ${daysDelta < 0 ? "text-red-600" : daysDelta <= 7 ? "text-amber-600" : "text-gray-500"}`}>
                  {daysDelta < 0
                    ? `${Math.abs(daysDelta)} days past due`
                    : daysDelta === 0
                      ? "due today"
                      : `${daysDelta} days remaining`}
                </div>
              )}
            </InfoRow>
          )}
          {w.start_date && (
            <InfoRow icon={<Clock className="h-4 w-4" />} label="Started">
              {new Date(w.start_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </InfoRow>
          )}
          {data.assigneeDisplay && (
            <InfoRow icon={<UserCircle2 className="h-4 w-4" />} label="Handled by">
              {data.assigneeDisplay}
            </InfoRow>
          )}
        </div>
      </div>

      {/* Stages timeline */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Progress</h2>
        <ol className="space-y-4">
          {data.stages.map((stage, idx) => (
            <StageMilestone key={stage.id} stage={stage} isLast={idx === data.stages.length - 1} />
          ))}
        </ol>
      </div>

      {/* Order sub-items (coffee orders) */}
      {data.orderItems.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Orders</h2>
          <ul className="divide-y divide-gray-100">
            {data.orderItems.map((item) => (
              <li key={item.id} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium text-gray-900">
                    {item.order_number ?? "Order"}
                    {item.order_total != null && (
                      <span className="text-gray-500 font-normal ml-2">${Number(item.order_total).toFixed(2)}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Placed {new Date(item.created_at).toLocaleDateString()}
                  </div>
                </div>
                <FulfillmentPill status={item.fulfillment_status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Shipments */}
      {data.shipments.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Shipments</h2>
          <ul className="space-y-3">
            {data.shipments.map((s) => (
              <li key={s.id} className="rounded-lg bg-gray-50 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-gray-500" />
                  <span className="font-medium text-gray-900">
                    {s.carrier ?? "Shipment"} — {s.quantity} {s.quantity === 1 ? "unit" : "units"}
                  </span>
                </div>
                {s.tracking_number && (
                  <div className="text-xs text-gray-500 mt-1 font-mono">Tracking: {s.tracking_number}</div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  {s.ship_date && `Shipped ${new Date(s.ship_date).toLocaleDateString()}`}
                  {s.actual_delivery_date && ` • Delivered ${new Date(s.actual_delivery_date).toLocaleDateString()}`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Customer messages (from staff) */}
      {data.notes.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Updates from our team</h2>
          <ul className="space-y-4">
            {data.notes.map((n) => (
              <li key={n.id} className="border-l-4 border-blue-200 pl-4">
                <div className="text-xs text-gray-500">{new Date(n.created_at).toLocaleString()}</div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap mt-1">{n.body}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500 flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-sm font-medium text-gray-900 mt-1">{children}</div>
    </div>
  );
}

function StageMilestone({ stage, isLast }: { stage: Stage; isLast: boolean }) {
  const isDone = stage.status === "completed";
  const isActive = stage.status === "in_progress";
  const isBlocked = stage.status === "blocked";
  const total = Number(stage.target_quantity ?? 0);
  const done = Number(stage.completed_quantity);

  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
          isDone ? "bg-emerald-500 border-emerald-500 text-white"
          : isActive ? "bg-white border-blue-500 text-blue-500"
          : isBlocked ? "bg-amber-100 border-amber-400 text-amber-700"
          : "bg-white border-gray-300 text-gray-400"
        }`}>
          {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Package className="h-3.5 w-3.5" />}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 my-1 min-h-6" />}
      </div>
      <div className="flex-1 pb-4">
        <div className="font-medium text-gray-900">{stage.stage_name}</div>
        {stage.stage_type === "quantity" && total > 0 && (
          <div className="text-sm text-gray-500 mt-0.5">
            {done} of {total} {done === 1 ? "unit" : "units"}
          </div>
        )}
        {stage.customer_message && (
          <div className="text-sm text-gray-600 mt-1">{stage.customer_message}</div>
        )}
      </div>
    </li>
  );
}

function FulfillmentPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending: { cls: "bg-gray-100 text-gray-700", label: "Pending" },
    processing: { cls: "bg-blue-100 text-blue-800", label: "Processing" },
    shipped: { cls: "bg-purple-100 text-purple-800", label: "Shipped" },
    fulfilled: { cls: "bg-emerald-100 text-emerald-800", label: "Fulfilled" },
    cancelled: { cls: "bg-gray-100 text-gray-500", label: "Cancelled" },
  };
  const s = map[status] ?? map.pending;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}
