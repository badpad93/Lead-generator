"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Search, X, Building2, Plus, Trash2, CheckSquare } from "lucide-react";
import { ENTITY_TYPES, type SalesAccount, type EntityType } from "@/lib/salesTypes";

export default function AccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ business_name: "", contact_name: "", phone: "", email: "", address: "", notes: "", entity_type: "location" as EntityType });
  const [userRole, setUserRole] = useState<"admin" | "sales">("sales");
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const fetchAccounts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/sales/accounts", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setAccounts(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  async function handleAdd() {
    if (!form.business_name) return;
    const res = await fetch("/api/sales/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to create account");
      return;
    }
    setForm({ business_name: "", contact_name: "", phone: "", email: "", address: "", notes: "", entity_type: "location" as EntityType });
    setShowAdd(false);
    fetchAccounts();
  }

  async function handleEntityType(e: React.MouseEvent | React.ChangeEvent, id: string, entity_type: string) {
    e.stopPropagation();
    await fetch(`/api/sales/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entity_type: entity_type || null }),
    });
    fetchAccounts();
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this account? Linked leads, deals, and orders will be unlinked.")) return;
    const res = await fetch(`/api/sales/accounts/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to delete");
      return;
    }
    fetchAccounts();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((a) => a.id)));
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected account${selected.size > 1 ? "s" : ""}? Linked leads, deals, and orders will be unlinked. This cannot be undone.`)) return;
    setBulkDeleting(true);
    const res = await fetch("/api/sales/accounts/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Bulk delete failed");
    }
    setSelected(new Set());
    setBulkDeleting(false);
    fetchAccounts();
  }

  const filtered = accounts.filter((a) =>
    !search || a.business_name.toLowerCase().includes(search.toLowerCase()) ||
    (a.contact_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Account
        </button>
      </div>

      {showAdd && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">New Account</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input placeholder="Business Name *" value={form.business_name} onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Contact Name" value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <select value={form.entity_type} onChange={(e) => setForm((f) => ({ ...f, entity_type: e.target.value as EntityType }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" rows={2} />
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">Save</button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search accounts..."
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-9 text-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <CheckSquare className="h-4 w-4 text-red-600 shrink-0" />
          <span className="text-sm font-medium text-red-800">{selected.size} account{selected.size > 1 ? "s" : ""} selected</span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
          >
            {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete Selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Building2 className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No accounts yet. Add one above or create a lead — accounts are auto-created with new leads.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                {userRole === "admin" && (
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-4 py-3 font-medium text-gray-500">Business</th>
                <th className="px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 font-medium text-gray-500">Contact</th>
                <th className="px-4 py-3 font-medium text-gray-500">Phone</th>
                <th className="px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 font-medium text-gray-500">Created</th>
                <th className="px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((acct) => (
                <tr
                  key={acct.id}
                  className="hover:bg-gray-50/50 cursor-pointer"
                  onClick={() => router.push(`/sales/accounts/${acct.id}`)}
                >
                  {userRole === "admin" && (
                    <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(acct.id)}
                        onChange={() => toggleSelect(acct.id)}
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium text-gray-900">{acct.business_name}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={acct.entity_type || ""}
                      onChange={(e) => handleEntityType(e, acct.id, e.target.value)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer"
                    >
                      <option value="">—</option>
                      {ENTITY_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{acct.contact_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{acct.phone || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{acct.email || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(acct.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => handleDelete(e, acct.id)}
                      title="Delete"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
