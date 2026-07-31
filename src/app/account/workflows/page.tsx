"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import {
  Loader2,
  Package,
  MapPin,
  DollarSign,
  Coffee,
  Globe,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

interface WorkflowCard {
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
  updated_at: string;
}

const TYPE_ICON: Record<string, typeof Package> = {
  ai_machine_fulfillment: Package,
  location_services: MapPin,
  financing: DollarSign,
  coffee_equipment: Coffee,
  coffee_service: Coffee,
  website_build: Globe,
};

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

export default function MyWorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setLoading(false);
        return;
      }
      const res = await fetch("/api/account/workflows", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  const active = workflows.filter((w) => !["completed", "cancelled", "refunded", "expired"].includes(w.overall_status));
  const completed = workflows.filter((w) => w.overall_status === "completed");
  const other = workflows.filter((w) => ["cancelled", "refunded", "expired"].includes(w.overall_status));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900">My Order Status</h1>
        <p className="text-gray-600 mt-2">
          Track fulfillment progress on every product and service you&apos;ve purchased.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <Section title="Active" workflows={active} />
          )}
          {completed.length > 0 && (
            <Section title="Completed" workflows={completed} tone="muted" />
          )}
          {other.length > 0 && (
            <Section title="Archived" workflows={other} tone="muted" />
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, workflows, tone }: { title: string; workflows: WorkflowCard[]; tone?: "muted" }) {
  return (
    <div>
      <h2 className={`text-xs uppercase tracking-wide font-semibold mb-3 ${tone === "muted" ? "text-gray-400" : "text-gray-500"}`}>
        {title}
      </h2>
      <div className="grid gap-3">
        {workflows.map((w) => (
          <WorkflowCardRender key={w.id} workflow={w} muted={tone === "muted"} />
        ))}
      </div>
    </div>
  );
}

function WorkflowCardRender({ workflow, muted }: { workflow: WorkflowCard; muted?: boolean }) {
  const Icon = TYPE_ICON[workflow.workflow_type] ?? Package;
  const total = Number(workflow.quantity_purchased);
  const done = Number(workflow.quantity_completed);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const daysDelta = workflow.due_date ? Math.floor((new Date(workflow.due_date).getTime() - Date.now()) / 86400_000) : null;

  const statusLabel = CUSTOMER_STATUS_LABELS[workflow.overall_status] ?? workflow.overall_status;
  const isDelayed = workflow.overall_status === "overdue" || workflow.overall_status === "at_risk";
  const isComplete = workflow.overall_status === "completed";

  return (
    <Link
      href={`/account/workflows/${workflow.id}`}
      className={`block rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        muted ? "border-gray-100 bg-gray-50/50" : "border-gray-100 bg-white shadow-sm"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          isComplete ? "bg-emerald-50 text-emerald-600" : isDelayed ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
        }`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-gray-900 truncate">{workflow.title}</div>
            {isComplete && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
            {isDelayed && <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
          </div>
          {workflow.product_name && (
            <div className="text-sm text-gray-500 truncate">{workflow.product_name}</div>
          )}
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className={`inline-flex items-center gap-1 font-medium ${
              isComplete ? "text-emerald-700" : isDelayed ? "text-amber-700" : "text-gray-700"
            }`}>
              {statusLabel}
            </span>
            {total > 0 && (
              <span className="text-gray-500">
                • {done} of {total} {done === 1 ? "unit" : "units"}
              </span>
            )}
            {workflow.due_date && !isComplete && (
              <span className="text-gray-500 inline-flex items-center gap-1">
                • <Clock className="h-3.5 w-3.5" />
                {daysDelta! < 0
                  ? `${Math.abs(daysDelta!)} days past due`
                  : daysDelta === 0
                    ? "due today"
                    : `${daysDelta} days remaining`}
              </span>
            )}
          </div>
          {total > 0 && (
            <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${isComplete ? "bg-emerald-500" : "bg-blue-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
        <ArrowRight className="h-5 w-5 text-gray-300 mt-2 shrink-0" />
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center">
      <Package className="mx-auto h-10 w-10 text-gray-300 mb-3" />
      <h3 className="text-lg font-medium text-gray-900">No orders in progress yet</h3>
      <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
        Once you place a purchase or sign an agreement, its fulfillment progress will show up here.
      </p>
    </div>
  );
}
