"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, ChevronLeft, Upload, MapPin, CheckCircle2, AlertCircle } from "lucide-react";

const WORKFLOW_TYPES = [
  { value: "ai_machine_fulfillment", label: "AI Machine Fulfillment" },
  { value: "location_services", label: "Location Services" },
  { value: "financing", label: "Financing" },
  { value: "coffee_equipment", label: "Coffee Equipment" },
  { value: "coffee_service", label: "Coffee Service" },
  { value: "website_build", label: "Website Build" },
];

export default function WorkflowBackfillPage() {
  const [customerId, setCustomerId] = useState("");
  const [workflowType, setWorkflowType] = useState("ai_machine_fulfillment");
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [prefill, setPrefill] = useState("");
  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string; workflow?: { id: string; workflow_number: string } } | null>(null);

  // Bulk backfill: paid location_services orders that never got a
  // workflow (guest submissions from before the profile-provisioning
  // fix). Uses the shared spawn helper — same code path the QB
  // webhook now runs, so results converge.
  const [locBackfilling, setLocBackfilling] = useState(false);
  const [locBackfillResult, setLocBackfillResult] = useState<
    | null
    | {
        error?: string;
        scanned?: number;
        spawned?: number;
        already_linked?: number;
        failed?: number;
        details?: Array<{
          order_id: string;
          recipient_email: string | null;
          outcome: "spawned" | "already_linked" | "failed";
          workflow_id?: string;
          reason?: string;
        }>;
      }
  >(null);

  async function runLocationServicesBackfill() {
    if (!confirm(
      "Run backfill for all paid location-services orders without a workflow?\n\n" +
      "This is idempotent — orders that already have a workflow are skipped. " +
      "Guests without a profile will be auto-provisioned so the workflow can attach.",
    )) return;
    setLocBackfilling(true);
    setLocBackfillResult(null);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setLocBackfillResult({ error: "Not authenticated" });
        return;
      }
      const res = await fetch("/api/admin/workflows/backfill-location-services", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      setLocBackfillResult(json);
    } catch (e) {
      setLocBackfillResult({ error: e instanceof Error ? e.message : "Network error" });
    } finally {
      setLocBackfilling(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    setResult(null);
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setPosting(false);
      setResult({ error: "Not authenticated" });
      return;
    }

    const completedQuantities = prefill
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [stageKey, num] = line.split("=").map((s) => s.trim());
        return { stageKey, completed: Number(num) };
      })
      .filter((x) => x.stageKey && !Number.isNaN(x.completed));

    const res = await fetch("/api/admin/workflows/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        customerId,
        workflowType,
        productName: productName || undefined,
        quantityPurchased: Number(quantity) || 1,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        notes: notes || undefined,
        completedQuantities,
      }),
    });
    const json = await res.json();
    setResult(json);
    setPosting(false);
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link href="/sales/workflows" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Workflows
      </Link>

      {/* Bulk backfill — one-shot recovery for paid location-services
          orders that never spawned a workflow (guest intake before the
          profile-provisioning fix). Idempotent — safe to re-run. */}
      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="flex-1">
            <h2 className="text-base font-semibold text-amber-900">
              Bulk backfill — Location Services (paid, no workflow)
            </h2>
            <p className="mt-1 text-sm text-amber-800">
              Scans every paid location-services order and spawns a workflow for any that don&apos;t already have one.
              Guests without a profile get a provisional account so the workflow can attach cleanly. Idempotent.
            </p>
            <button
              type="button"
              onClick={runLocationServicesBackfill}
              disabled={locBackfilling}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
            >
              {locBackfilling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Backfilling…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Run Location Services Backfill
                </>
              )}
            </button>

            {locBackfillResult && (
              <div className="mt-4 space-y-2">
                {locBackfillResult.error ? (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{locBackfillResult.error}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
                        Scanned: {locBackfillResult.scanned ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        Spawned: {locBackfillResult.spawned ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200">
                        Already linked: {locBackfillResult.already_linked ?? 0}
                      </span>
                      {(locBackfillResult.failed ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 ring-1 ring-inset ring-red-200">
                          <AlertCircle className="h-3 w-3" />
                          Failed: {locBackfillResult.failed}
                        </span>
                      )}
                    </div>

                    {locBackfillResult.details && locBackfillResult.details.length > 0 && (
                      <details className="rounded-lg border border-amber-100 bg-white/60 p-2 text-xs">
                        <summary className="cursor-pointer font-medium text-amber-900">Per-order detail</summary>
                        <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                          {locBackfillResult.details.map((d) => (
                            <div key={d.order_id + d.outcome} className="flex items-start gap-2 border-b border-amber-100 py-1 last:border-0">
                              <span
                                className={
                                  d.outcome === "spawned"
                                    ? "inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
                                    : d.outcome === "already_linked"
                                    ? "inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700"
                                    : "inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800"
                                }
                              >
                                {d.outcome}
                              </span>
                              <span className="font-mono text-gray-500">{d.order_id.slice(0, 8)}</span>
                              <span className="text-gray-700">{d.recipient_email ?? "—"}</span>
                              {d.reason && <span className="text-red-700">{d.reason}</span>}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Backfill Workflow</h1>
        <p className="text-sm text-gray-500 mt-2">
          Create a workflow for an existing customer whose purchase or agreement predates this system.
          Suppresses initial customer emails and marks the row as imported.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Customer user ID (uuid)</label>
            <input
              type="text"
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Workflow type</label>
              <select
                value={workflowType}
                onChange={(e) => setWorkflowType(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              >
                {WORKFLOW_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Quantity purchased</label>
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
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Product name (display)</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. 10 × VendEra AI Machine"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">
              Prefill completed quantities (one per line: stage_key = number)
            </label>
            <textarea
              value={prefill}
              onChange={(e) => setPrefill(e.target.value)}
              rows={4}
              placeholder="ordered = 10&#10;shipped = 6&#10;delivered = 2"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-gray-500 mt-1">
              Bypasses monotonic validation — use for real-world state that may not be perfectly ordered.
            </p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Import notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={posting || !customerId}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import workflow
          </button>
        </form>

        {result && (
          <div className={`mt-4 rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
            {result.ok ? (
              <>
                Imported workflow {result.workflow?.workflow_number}.{" "}
                <Link href={`/sales/workflows/${result.workflow?.id}`} className="underline">Open →</Link>
              </>
            ) : (
              <>Error: {result.error}</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
