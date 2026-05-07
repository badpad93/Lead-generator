"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Plus, ChevronRight, Search, Building2, X, Trash2, CheckSquare } from "lucide-react";

interface Account {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
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
}

interface Pipeline { id: string; name: string; type: string; pipeline_steps: { id: string; name: string; order_index: number }[] }

export default function PipelineItemsPage() {
  const { id: pipelineId } = useParams<{ id: string }>();
  const [token, setToken] = useState("");
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "" });
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showAccountList, setShowAccountList] = useState(false);

  const [userRole, setUserRole] = useState<"admin" | "sales">("sales");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      setToken(session.access_token);
      const res = await fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const users = await res.json();
        const me = users.find((u: { id: string }) => u.id === session.user.id);
        if (me?.role === "admin" || me?.role === "director_of_sales" || me?.role === "market_leader") setUserRole("admin");
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (!token || !pipelineId) return;
    setLoading(true);
    const [pRes, iRes, aRes] = await Promise.all([
      fetch(`/api/pipelines/${pipelineId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/pipeline-items?pipeline_id=${pipelineId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/sales/accounts", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (pRes.ok) setPipeline(await pRes.json());
    if (iRes.ok) setItems(await iRes.json());
    if (aRes.ok) setAccounts(await aRes.json());
    setLoading(false);
  }, [token, pipelineId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.name) return;
    setSaving(true);
    await fetch("/api/pipeline-items", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        pipeline_id: pipelineId,
        name: form.name,
        account_id: selectedAccount?.id || null,
      }),
    });
    setForm({ name: "" });
    setSelectedAccount(null);
    setAccountSearch("");
    setShowAdd(false);
    setSaving(false);
    load();
  }

  function selectAccount(account: Account) {
    setSelectedAccount(account);
    setAccountSearch("");
    setShowAccountList(false);
    if (!form.name) setForm((f) => ({ ...f, name: account.business_name }));
  }

  const displayedAccounts = accountSearch.length > 0
    ? accounts.filter((a) =>
        a.business_name.toLowerCase().includes(accountSearch.toLowerCase()) ||
        (a.contact_name || "").toLowerCase().includes(accountSearch.toLowerCase()) ||
        (a.email || "").toLowerCase().includes(accountSearch.toLowerCase())
      )
    : accounts;

  function toggleSelectItem(id: string) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAllItems() {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map((i) => i.id)));
    }
  }

  async function handleBulkDeleteItems() {
    if (selectedItems.size === 0) return;
    if (!confirm(`Delete ${selectedItems.size} selected item${selectedItems.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    const res = await fetch("/api/pipeline-items/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: Array.from(selectedItems) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Bulk delete failed");
    }
    setSelectedItems(new Set());
    setBulkDeleting(false);
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

      {/* Bulk selection banner */}
      {selectedItems.size > 0 && userRole === "admin" && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <CheckSquare className="h-4 w-4 text-red-600 shrink-0" />
          <span className="text-sm font-medium text-red-800">{selectedItems.size} item{selectedItems.size > 1 ? "s" : ""} selected</span>
          <button
            onClick={handleBulkDeleteItems}
            disabled={bulkDeleting}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
          >
            {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete Selected
          </button>
          <button onClick={() => setSelectedItems(new Set())} className="text-red-400 hover:text-red-600 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Admin select-all toggle */}
      {userRole === "admin" && items.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={items.length > 0 && selectedItems.size === items.length}
            onChange={toggleSelectAllItems}
            className="h-4 w-4 rounded border-gray-300 text-green-600 cursor-pointer"
          />
          <span className="text-xs text-gray-500">Select all ({items.length})</span>
        </div>
      )}

      {showAdd && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">New Pipeline Item</h3>
          {/* Link Account */}
          <div className="mb-3">
            {selectedAccount ? (
              <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-green-600" />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{selectedAccount.business_name}</span>
                    {selectedAccount.contact_name && <span className="text-xs text-gray-500 ml-2">{selectedAccount.contact_name}</span>}
                    {selectedAccount.email && <span className="text-xs text-gray-400 ml-2">{selectedAccount.email}</span>}
                  </div>
                </div>
                <button onClick={() => { setSelectedAccount(null); setForm((f) => ({ ...f, name: "" })); }} className="text-gray-400 hover:text-red-500 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : !showAccountList ? (
              <button
                onClick={() => setShowAccountList(true)}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-green-300 cursor-pointer"
              >
                <Building2 className="h-4 w-4 text-gray-400" />
                Link Account
              </button>
            ) : (
              <div className="rounded-lg border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                  <span className="text-xs font-medium text-gray-500">Select an account</span>
                  <button onClick={() => { setShowAccountList(false); setAccountSearch(""); }} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="px-3 py-2 border-b border-gray-100">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      placeholder="Filter accounts..."
                      className="w-full rounded-md border border-gray-200 py-1.5 pl-8 pr-3 text-sm focus:border-green-500 focus:outline-none"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {displayedAccounts.length > 0 ? (
                    displayedAccounts.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => selectAccount(a)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 cursor-pointer"
                      >
                        <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{a.business_name}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {[a.contact_name, a.email, a.phone].filter(Boolean).join(" · ") || "No contact info"}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-4 text-sm text-gray-400 text-center">No accounts found</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <input placeholder="Name / Business *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <button onClick={handleAdd} disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">{saving ? "Adding..." : "Add"}</button>
            <button onClick={() => { setShowAdd(false); setSelectedAccount(null); setAccountSearch(""); setShowAccountList(false); }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
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
                  <div key={item.id} className="relative">
                    {userRole === "admin" && (
                      <div className="absolute top-2 right-2 z-10" onClick={(e) => e.preventDefault()}>
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleSelectItem(item.id)}
                          className="h-4 w-4 rounded border-gray-300 text-green-600 cursor-pointer"
                        />
                      </div>
                    )}
                    <Link
                      href={`/sales/pipelines/${pipelineId}/items/${item.id}`}
                      className={`block rounded-lg border bg-white p-3 hover:border-green-200 transition-colors ${selectedItems.has(item.id) ? "border-red-300 bg-red-50/30" : "border-gray-200"}`}
                    >
                      <p className="text-sm font-medium text-gray-900 pr-6">{item.name}</p>
                      {item.sales_accounts && <p className="text-xs text-gray-400">{item.sales_accounts.business_name}</p>}
                      <div className="flex items-center justify-between mt-2">
                        {item.value > 0 && <span className="text-xs font-medium text-green-600">${Number(item.value).toLocaleString()}</span>}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(item.status)}`}>{item.status}</span>
                      </div>
                    </Link>
                  </div>
                ))}
                {stepItems.length === 0 && <p className="text-xs text-gray-300 text-center py-4">Empty</p>}
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}
