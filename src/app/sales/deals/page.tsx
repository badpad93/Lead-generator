"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import {
  Loader2,
  Plus,
  Trash2,
  Lock,
  GitBranch,
  LayoutDashboard,
  Search,
  Building2,
  X,
  DollarSign,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import type { DealStage } from "@/lib/salesTypes";
import { DEAL_STAGES } from "@/lib/salesTypes";
import type { SalesDeal } from "@/lib/salesTypes";

type DealWithPipeline = SalesDeal & { pipelines?: { id: string; name: string } | null };

interface SalesPipeline {
  id: string;
  name: string;
  type: string;
  pipeline_steps?: { id: string; name: string; order_index: number }[];
}

interface PipelineItem {
  id: string;
  name: string;
  status: string;
  value: number;
  pipeline_steps: { id: string; name: string; order_index: number } | null;
  sales_accounts: { business_name: string } | null;
  employees: { full_name: string } | null;
  created_at: string;
  deal_id: string | null;
}

interface Account {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

const STAGE_COLORS: Record<DealStage, string> = {
  new: "border-t-blue-400",
  contacted: "border-t-yellow-400",
  qualified: "border-t-cyan-400",
  proposal: "border-t-purple-400",
  closing: "border-t-orange-400",
  won: "border-t-green-500",
  lost: "border-t-red-400",
};

export default function DealDashboardPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<DealWithPipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [formPipeline, setFormPipeline] = useState("");
  const [pipelines, setPipelines] = useState<SalesPipeline[]>([]);
  const [dragError, setDragError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("all");
  const [pipelineItems, setPipelineItems] = useState<PipelineItem[]>([]);
  const [pipelineSteps, setPipelineSteps] = useState<{ id: string; name: string; order_index: number }[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [formValue, setFormValue] = useState("");

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      setToken(session.access_token);
      const [pRes, aRes] = await Promise.all([
        fetch("/api/pipelines?type=sales", { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch("/api/sales/accounts", { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ]);
      if (pRes.ok) {
        const data = await pRes.json();
        setPipelines(data);
      }
      if (aRes.ok) setAccounts(await aRes.json());
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

  const fetchPipelineItems = useCallback(async (pipelineId: string) => {
    if (!token) return;
    setPipelineLoading(true);
    const [pRes, iRes] = await Promise.all([
      fetch(`/api/pipelines/${pipelineId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/pipeline-items?pipeline_id=${pipelineId}`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (pRes.ok) {
      const data = await pRes.json();
      setPipelineSteps((data.pipeline_steps || []).sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index));
    }
    if (iRes.ok) setPipelineItems(await iRes.json());
    setPipelineLoading(false);
  }, [token]);

  useEffect(() => {
    if (activeTab !== "all") fetchPipelineItems(activeTab);
  }, [activeTab, fetchPipelineItems]);

  async function handleCreate() {
    if (!newName.trim()) return;
    const pipelineId = activeTab !== "all" ? activeTab : (formPipeline || null);
    const res = await fetch("/api/sales/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        business_name: newName.trim(),
        pipeline_id: pipelineId,
        account_id: selectedAccount?.id || null,
        value: Number(formValue) || 0,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to create deal");
      return;
    }
    setNewName("");
    setFormPipeline("");
    setFormValue("");
    setSelectedAccount(null);
    setAccountSearch("");
    setShowAdd(false);
    fetchDeals();
    if (activeTab !== "all") fetchPipelineItems(activeTab);
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
    if (activeTab !== "all") fetchPipelineItems(activeTab);
  }

  async function handleDrop(dealId: string, newStage: DealStage) {
    setDragError(null);
    const deal = deals.find((d) => d.id === dealId);
    if (deal?.locked_at) {
      setDragError(`"${deal.business_name}" is locked and cannot be moved.`);
      setTimeout(() => setDragError(null), 4000);
      return;
    }
    setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, stage: newStage } : d));
    const res = await fetch(`/api/sales/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ stage: newStage }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setDragError(err.validation_errors ? err.validation_errors.join(". ") : (err.error || "Failed to update stage"));
      setTimeout(() => setDragError(null), 5000);
    }
    fetchDeals();
  }

  function selectAccount(account: Account) {
    setSelectedAccount(account);
    setAccountSearch("");
    setShowAccountDropdown(false);
    if (!newName) setNewName(account.business_name);
  }

  const filteredAccounts = accountSearch.length > 0
    ? accounts.filter((a) =>
        a.business_name.toLowerCase().includes(accountSearch.toLowerCase()) ||
        (a.contact_name || "").toLowerCase().includes(accountSearch.toLowerCase()) ||
        (a.email || "").toLowerCase().includes(accountSearch.toLowerCase())
      ).slice(0, 8)
    : [];

  const statusColor = (s: string) => {
    if (s === "won") return "bg-green-50 text-green-700";
    if (s === "lost") return "bg-red-50 text-red-600";
    return "bg-blue-50 text-blue-600";
  };

  const activePipeline = pipelines.find((p) => p.id === activeTab);

  // Summary stats
  const totalDeals = deals.length;
  const totalValue = deals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost").length;
  const wonDeals = deals.filter((d) => d.stage === "won").length;

  if (loading && !deals.length) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Deal Dashboard</h1>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Deal
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs text-gray-400">Total Deals</p>
          <p className="text-lg font-bold text-gray-900">{totalDeals}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs text-gray-400">Open</p>
          <p className="text-lg font-bold text-blue-600">{openDeals}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs text-gray-400">Won</p>
          <p className="text-lg font-bold text-green-600">{wonDeals}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs text-gray-400 flex items-center gap-1"><DollarSign className="h-3 w-3" />Total Value</p>
          <p className="text-lg font-bold text-green-600">${totalValue.toLocaleString()}</p>
        </div>
      </div>

      {/* Pipeline Tabs */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setActiveTab("all")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer ${
            activeTab === "all"
              ? "bg-green-600 text-white"
              : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          All Deals
        </button>
        {pipelines.map((p) => {
          const pipelineDeals = deals.filter((d) => d.pipelines?.id === p.id);
          return (
            <button
              key={p.id}
              onClick={() => setActiveTab(p.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer ${
                activeTab === p.id
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              {p.name}
              <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs ${activeTab === p.id ? "bg-green-700 text-green-100" : "bg-gray-100 text-gray-500"}`}>
                {pipelineDeals.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Error Banner */}
      {dragError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{dragError}</p>
        </div>
      )}

      {/* Add Deal Form */}
      {showAdd && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">New Deal</h3>
          {/* Account Search */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-gray-500">Link Account (optional)</label>
            {selectedAccount ? (
              <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-900">{selectedAccount.business_name}</span>
                  {selectedAccount.contact_name && <span className="text-xs text-gray-500">{selectedAccount.contact_name}</span>}
                </div>
                <button onClick={() => { setSelectedAccount(null); setNewName(""); }} className="text-gray-400 hover:text-red-500 cursor-pointer"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={accountSearch}
                  onChange={(e) => { setAccountSearch(e.target.value); setShowAccountDropdown(true); }}
                  onFocus={() => { if (accountSearch) setShowAccountDropdown(true); }}
                  placeholder="Search accounts..."
                  className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-3 text-sm focus:border-green-500 focus:outline-none"
                />
                {showAccountDropdown && filteredAccounts.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                    {filteredAccounts.map((a) => (
                      <button key={a.id} onClick={() => selectAccount(a)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-50 cursor-pointer">
                        <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{a.business_name}</p>
                          <p className="text-xs text-gray-400 truncate">{[a.contact_name, a.email].filter(Boolean).join(" · ") || "No contact info"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Business name *"
              className="flex-1 min-w-[180px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            <input
              type="number"
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder="Value ($)"
              className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            {activeTab === "all" && (
              <div className="relative">
                <GitBranch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <select
                  value={formPipeline}
                  onChange={(e) => setFormPipeline(e.target.value)}
                  className="rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
                >
                  <option value="">No pipeline</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button onClick={handleCreate} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">Create</button>
            <button onClick={() => { setShowAdd(false); setNewName(""); setFormPipeline(""); setFormValue(""); setSelectedAccount(null); setAccountSearch(""); }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
          {(activeTab !== "all" || formPipeline) && (
            <p className="mt-2 text-xs text-gray-400">This deal will also be added to the {activeTab !== "all" ? activePipeline?.name : "selected"} pipeline automatically.</p>
          )}
        </div>
      )}

      {/* ============ ALL DEALS VIEW ============ */}
      {activeTab === "all" && (
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
                      draggable={!deal.locked_at}
                      onDragStart={(e) => {
                        if (deal.locked_at) { e.preventDefault(); return; }
                        e.dataTransfer.setData("dealId", deal.id);
                        setDragging(deal.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => router.push(`/sales/deals/${deal.id}`)}
                      className={`cursor-pointer rounded-lg border border-gray-200 border-t-2 bg-white p-3 shadow-sm transition-all hover:shadow-md ${STAGE_COLORS[deal.stage]} ${
                        dragging === deal.id ? "opacity-50" : ""
                      } ${deal.locked_at ? "opacity-75" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {deal.locked_at && <Lock className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                          <p className="text-sm font-medium text-gray-900 truncate">{deal.business_name}</p>
                        </div>
                        {!deal.locked_at && (
                          <button
                            onClick={(e) => handleDeleteDeal(e, deal.id)}
                            title="Delete"
                            className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {deal.pipelines && (
                        <div className="mt-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                            <GitBranch className="h-2.5 w-2.5" />
                            {deal.pipelines.name}
                          </span>
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-xs text-gray-500 truncate">{deal.assigned_profile?.full_name || "Unassigned"}</span>
                        <span className="text-xs font-semibold text-green-600">${Number(deal.value).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                  {stageDeals.length === 0 && <p className="py-6 text-center text-xs text-gray-400">No deals</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ PIPELINE VIEW ============ */}
      {activeTab !== "all" && (
        pipelineLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
        ) : (
          <div>
            {/* Pipeline step header */}
            <div className="mb-4 flex items-center gap-1 text-xs text-gray-400">
              <GitBranch className="h-3.5 w-3.5" />
              {pipelineSteps.map((step, i) => (
                <span key={step.id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  <span>{step.name}</span>
                </span>
              ))}
            </div>

            {/* Kanban by pipeline steps */}
            <div className="flex gap-4 overflow-x-auto pb-4">
              {pipelineSteps.map((step) => {
                const stepItems = pipelineItems.filter((item) => {
                  const itemStep = item.pipeline_steps as { id: string } | null;
                  return itemStep?.id === step.id && item.status !== "won" && item.status !== "lost";
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
                          href={`/sales/pipelines/${activeTab}/items/${item.id}`}
                          className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-green-200 transition-colors"
                        >
                          <p className="text-sm font-medium text-gray-900">{item.name}</p>
                          {item.sales_accounts && <p className="text-xs text-gray-400 mt-0.5">{item.sales_accounts.business_name}</p>}
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

              {/* Won / Lost columns */}
              {["won", "lost"].map((status) => {
                const statusItems = pipelineItems.filter((i) => i.status === status);
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
                          href={`/sales/pipelines/${activeTab}/items/${item.id}`}
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
        )
      )}
    </div>
  );
}
