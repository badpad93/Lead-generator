"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, ChevronLeft, Upload } from "lucide-react";

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
