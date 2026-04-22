"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Plus, ChevronRight } from "lucide-react";

interface PipelineItem {
  id: string;
  name: string;
  status: string;
  value: number;
  pipeline_steps: { id: string; name: string; order_index: number } | null;
  sales_accounts: { business_name: string } | null;
  employees: { full_name: string } | null;
  created_at: string;
}

interface Pipeline { id: string; name: string; type: string; pipeline_steps: { id: string; name: string; order_index: number }[] }

export default function PipelineItemsPage() {
  const { id: pipelineId } = useParams<{ id: string }>();
  const [token, setToken] = useState("");
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", value: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, []);

  const load = useCallback(async () => {
    if (!token || !pipelineId) return;
    setLoading(true);
    const [pRes, iRes] = await Promise.all([
      fetch(`/api/pipelines/${pipelineId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/pipeline-items?pipeline_id=${pipelineId}`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (pRes.ok) setPipeline(await pRes.json());
    if (iRes.ok) setItems(await iRes.json());
    setLoading(false);
  }, [token, pipelineId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.name) return;
    setSaving(true);
    await fetch("/api/pipeline-items", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pipeline_id: pipelineId, name: form.name, value: Number(form.value) || 0 }),
    });
    setForm({ name: "", value: "" });
    setShowAdd(false);
    setSaving(false);
    load();
  }

  const statusColor = (s: string) => {
    if (s === "won") return "bg-green-50 text-green-700";
    if (s === "lost") return "bg-red-50 text-red-600";
    return "bg-blue-50 text-blue-600";
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  // Group items by step for Kanban-style display
  const steps = pipeline?.pipeline_steps || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/sales/pipelines" className="text-xs text-gray-400 hover:text-gray-600">Pipelines</Link>
          <h1 className="text-2xl font-bold text-gray-900">{pipeline?.name || "Pipeline"}</h1>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Add Item
        </button>
      </div>

      {showAdd && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex gap-3">
            <input placeholder="Name / Business" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Value ($)" type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} className="w-32 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <button onClick={handleAdd} disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">{saving ? "Adding..." : "Add"}</button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {steps.map((step) => {
          const stepItems = items.filter((i) => {
            const itemStep = i.pipeline_steps as { id: string } | null;
            return itemStep?.id === step.id;
          });
          return (
            <div key={step.id} className="min-w-[260px] flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase">{step.name}</h3>
                <span className="text-xs text-gray-300">{stepItems.length}</span>
              </div>
              <div className="space-y-2">
                {stepItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/sales/pipelines/${pipelineId}/items/${item.id}`}
                    className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-green-200 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {item.sales_accounts && <p className="text-xs text-gray-400">{item.sales_accounts.business_name}</p>}
                    <div className="flex items-center justify-between mt-2">
                      {item.value > 0 && <span className="text-xs font-medium text-green-600">${Number(item.value).toLocaleString()}</span>}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(item.status)}`}>{item.status}</span>
                    </div>
                  </Link>
                ))}
                {stepItems.length === 0 && <p className="text-xs text-gray-300 text-center py-4">Empty</p>}
              </div>
            </div>
          );
        })}

        {/* Won/Lost columns */}
        {["won", "lost"].map((status) => {
          const statusItems = items.filter((i) => i.status === status);
          if (statusItems.length === 0) return null;
          return (
            <div key={status} className="min-w-[260px] flex-shrink-0">
              <h3 className={`text-xs font-semibold uppercase mb-2 ${status === "won" ? "text-green-600" : "text-red-500"}`}>
                {status} ({statusItems.length})
              </h3>
              <div className="space-y-2">
                {statusItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/sales/pipelines/${pipelineId}/items/${item.id}`}
                    className="block rounded-lg border border-gray-200 bg-white p-3 opacity-60"
                  >
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {item.value > 0 && <p className="text-xs text-green-600">${Number(item.value).toLocaleString()}</p>}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
