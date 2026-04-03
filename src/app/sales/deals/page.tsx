"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Deal Pipeline</h1>
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
                    <p className="text-sm font-medium text-gray-900 truncate">{deal.business_name}</p>
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
