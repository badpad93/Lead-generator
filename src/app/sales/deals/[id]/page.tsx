"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Loader2, Lock, DollarSign } from "lucide-react";
import type { SalesDeal, SalesCommission } from "@/lib/salesTypes";
import { DEAL_STAGES, IMMEDIATE_NEEDS } from "@/lib/salesTypes";

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deal, setDeal] = useState<SalesDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [stageError, setStageError] = useState<string | null>(null);
  const [commissions, setCommissions] = useState<SalesCommission[]>([]);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        setToken(session.access_token);
        const res = await fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.ok) {
          const users = await res.json();
          const me = users.find((u: { id: string }) => u.id === session.user.id);
          if (me) setUserRole(me.role);
        }
      }
    }
    init();
  }, []);

  const fetchDeal = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    const res = await fetch(`/api/sales/deals/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setDeal(await res.json());
    setLoading(false);
  }, [token, id]);

  const fetchCommissions = useCallback(async () => {
    if (!token || !id) return;
    const res = await fetch(`/api/sales/commissions`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const all: SalesCommission[] = await res.json();
      setCommissions(all.filter((c) => c.deal_id === id));
    }
  }, [token, id]);

  useEffect(() => { fetchDeal(); fetchCommissions(); }, [fetchDeal, fetchCommissions]);

  const isAdmin = userRole === "admin" || userRole === "director_of_sales";
  const isLocked = !!deal?.locked_at && !isAdmin;

  async function handleStageChange(stage: string) {
    setStageError(null);
    const res = await fetch(`/api/sales/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.validation_errors) {
        setStageError(err.validation_errors.join(". "));
      } else {
        setStageError(err.error || "Failed to change stage");
      }
      return;
    }
    fetchDeal();
    fetchCommissions();
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;
  }

  if (!deal) {
    return <div className="p-6 text-center text-gray-400">Deal not found</div>;
  }

  const needLabel = IMMEDIATE_NEEDS.find((n) => n.value === deal.immediate_need)?.label;

  const commissionStatusColor: Record<string, string> = {
    pending: "bg-yellow-50 text-yellow-700 ring-yellow-200",
    approved: "bg-blue-50 text-blue-700 ring-blue-200",
    paid: "bg-green-50 text-green-700 ring-green-200",
  };

  return (
    <div className="p-6 max-w-4xl">
      <button onClick={() => router.push("/sales/deals")} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to Deals
      </button>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{deal.business_name}</h1>
              {isLocked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                  <Lock className="h-3 w-3" /> Locked
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">Assigned to: {deal.assigned_profile?.full_name || "Unassigned"}</p>
          </div>
          {needLabel && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
              {needLabel}
            </span>
          )}
        </div>

        {/* Stage */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
          <select
            value={deal.stage}
            onChange={(e) => handleStageChange(e.target.value)}
            disabled={isLocked}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {DEAL_STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {!!deal.locked_at && !isAdmin && (
            <p className="mt-1 text-xs text-amber-600">This deal is locked. Only admins can modify won or lost deals.</p>
          )}
          {!!deal.locked_at && isAdmin && (
            <p className="mt-1 text-xs text-blue-600">Admin override: you can change the stage for claw backs.</p>
          )}
          {stageError && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm text-red-700">{stageError}</p>
            </div>
          )}
        </div>

        {/* Immediate Need */}
        {needLabel && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Immediate Need</h2>
            <p className="text-sm text-gray-700">{needLabel}</p>
          </div>
        )}

        {/* Commission Info */}
        {commissions.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-green-600" /> Commission
            </h2>
            <div className="space-y-2">
              {commissions.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      ${Number(c.commission_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(Number(c.commission_rate) * 100).toFixed(0)}% of ${Number(c.deal_value).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset capitalize ${commissionStatusColor[c.status] || ""}`}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
