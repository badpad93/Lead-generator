"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { SalesDeal, DealStage } from "@/lib/salesTypes";
import { DEAL_STAGES } from "@/lib/salesTypes";

const STAGE_COLORS: Record<DealStage, string> = {
  new: "border-t-blue-400",
  contacted: "border-t-yellow-400",
  qualified: "border-t-cyan-400",
  proposal: "border-t-purple-400",
  closing: "border-t-orange-400",
  won: "border-t-green-500",
  lost: "border-t-red-400",
};

export default function DealsPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<SalesDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  async function handleCreate() {
    if (!newName.trim()) return;
    const res = await fetch("/api/sales/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ business_name: newName.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to create deal");
      return;
    }
    setNewName("");
    setShowAdd(false);
    fetchDeals();
  }

  async function handleDeleteDeal(e: React.MouseEvent, dealId: string) {
    e.stopPropagation();
    if (!confirm("Delete this deal?")) return;
    const res = await fetch(`/api/sales/deals/${dealId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to delete");
      return;
    }
    fetchDeals();
  }

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) setToken(session.access_token);
    }
    init();
  }, []);

  const fetchDeals = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/sales/deals", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setDeals(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  async function handleDrop(dealId: string, newStage: DealStage) {
    // Optimistic update
    setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, stage: newStage } : d));
    await fetch(`/api/sales/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ stage: newStage }),
    });
    fetchDeals();
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Deal Pipeline</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Deal
        </button>
      </div>
      {showAdd && (
        <div className="mb-4 flex gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Business name"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
          <button onClick={handleCreate} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">Create</button>
          <button onClick={() => { setShowAdd(false); setNewName(""); }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {DEAL_STAGES.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage.value);
          return (
            <div
              key={stage.value}
              className="min-w-[220px] flex-shrink-0 rounded-xl bg-gray-100/60 p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dealId = e.dataTransfer.getData("dealId");
                if (dealId) handleDrop(dealId, stage.value);
                setDragging(null);
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">{stage.label}</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-500 shadow-sm">
                  {stageDeals.length}
                </span>
              </div>
              <div className="space-y-2">
                {stageDeals.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("dealId", deal.id);
                      setDragging(deal.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => router.push(`/sales/deals/${deal.id}`)}
                    className={`cursor-pointer rounded-lg border border-gray-200 border-t-2 bg-white p-3 shadow-sm transition-all hover:shadow-md ${STAGE_COLORS[deal.stage]} ${
                      dragging === deal.id ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate flex-1">{deal.business_name}</p>
                      <button
                        onClick={(e) => handleDeleteDeal(e, deal.id)}
                        title="Delete"
                        className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs text-gray-500 truncate">{deal.assigned_profile?.full_name || "Unassigned"}</span>
                      <span className="text-xs font-semibold text-green-600">
                        ${Number(deal.value).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
                {stageDeals.length === 0 && (
                  <p className="py-6 text-center text-xs text-gray-400">No deals</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
