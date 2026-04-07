"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { Plus, Loader2, Search, X, UserPlus, ArrowRight, Trash2, PhoneOff, Phone } from "lucide-react";
import type { SalesLead } from "@/lib/salesTypes";

export default function LeadsPage() {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "sales">("sales");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [salesUsers, setSalesUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [stateFilter, setStateFilter] = useState("");
  const [hideDnc, setHideDnc] = useState(false);
  const [addForm, setAddForm] = useState({ business_name: "", contact_name: "", phone: "", email: "", address: "", city: "", state: "", source: "", notes: "", do_not_call: false });

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      setToken(session.access_token);
      setUserId(session.user.id);

      const usersRes = await fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (usersRes.ok) {
        const users = await usersRes.json();
        setSalesUsers(users);
        const me = users.find((u: { id: string }) => u.id === session.user.id);
        if (me?.role === "admin") setUserRole("admin");
      }
    }
    init();
  }, []);

  const fetchLeads = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/sales/leads", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setLeads(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  async function handleAdd() {
    if (!addForm.business_name) return;
    const res = await fetch("/api/sales/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(addForm),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to add lead");
      return;
    }
    setAddForm({ business_name: "", contact_name: "", phone: "", email: "", address: "", city: "", state: "", source: "", notes: "", do_not_call: false });
    setShowAdd(false);
    fetchLeads();
  }

  async function handleClaim(id: string) {
    await fetch(`/api/sales/leads/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "claim" }),
    });
    fetchLeads();
  }

  async function handleAssign(id: string, assignTo: string) {
    await fetch(`/api/sales/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assigned_to: assignTo }),
    });
    fetchLeads();
  }

  async function handleConvert(id: string) {
    const res = await fetch(`/api/sales/leads/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "convert" }),
    });
    if (res.ok) {
      fetchLeads();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    const res = await fetch(`/api/sales/leads/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to delete");
      return;
    }
    fetchLeads();
  }

  async function handleToggleDnc(id: string, current: boolean) {
    await fetch(`/api/sales/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ do_not_call: !current }),
    });
    fetchLeads();
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/sales/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    fetchLeads();
  }

  const availableStates = Array.from(
    new Set(leads.map((l) => (l.state || "").trim().toUpperCase()).filter(Boolean))
  ).sort();

  const filtered = leads.filter((l) => {
    if (hideDnc && l.do_not_call) return false;
    if (stateFilter && (l.state || "").toUpperCase() !== stateFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.business_name.toLowerCase().includes(q) ||
      (l.contact_name || "").toLowerCase().includes(q) ||
      (l.state || "").toLowerCase().includes(q) ||
      (l.city || "").toLowerCase().includes(q)
    );
  });

  const statusColor: Record<string, string> = {
    new: "bg-blue-50 text-blue-700 ring-blue-200",
    contacted: "bg-yellow-50 text-yellow-700 ring-yellow-200",
    qualified: "bg-green-50 text-green-700 ring-green-200",
    unqualified: "bg-gray-100 text-gray-600 ring-gray-200",
    lost: "bg-red-50 text-red-700 ring-red-200",
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Add Lead
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">New Lead</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input placeholder="Business Name *" value={addForm.business_name} onChange={(e) => setAddForm((f) => ({ ...f, business_name: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Contact Name" value={addForm.contact_name} onChange={(e) => setAddForm((f) => ({ ...f, contact_name: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Phone" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Address" value={addForm.address} onChange={(e) => setAddForm((f) => ({ ...f, address: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="City" value={addForm.city} onChange={(e) => setAddForm((f) => ({ ...f, city: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="State (e.g. TX)" maxLength={2} value={addForm.state} onChange={(e) => setAddForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none uppercase" />
            <input placeholder="Source (referral, web, cold call...)" value={addForm.source} onChange={(e) => setAddForm((f) => ({ ...f, source: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
          </div>
          <textarea placeholder="Notes" value={addForm.notes} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" rows={2} />
          <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={addForm.do_not_call}
              onChange={(e) => setAddForm((f) => ({ ...f, do_not_call: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <PhoneOff className="h-4 w-4 text-red-600" />
            Do Not Call
          </label>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">Save</button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* Search + state filter */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business, contact, city, or state..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
        >
          <option value="">All States</option>
          {availableStates.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={hideDnc}
            onChange={(e) => setHideDnc(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          Hide Do Not Call
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">No leads found</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Business</th>
                <th className="px-4 py-3 font-medium text-gray-500">Contact</th>
                <th className="px-4 py-3 font-medium text-gray-500">Phone</th>
                <th className="px-4 py-3 font-medium text-gray-500">State</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Assigned</th>
                <th className="px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{lead.business_name}</td>
                  <td className="px-4 py-3 text-gray-600">{lead.contact_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {lead.do_not_call ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200" title="Do Not Call">
                        <PhoneOff className="h-3 w-3" />
                        DNC
                      </span>
                    ) : (
                      lead.phone || "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {lead.state ? (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {lead.state}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset cursor-pointer ${statusColor[lead.status] || ""}`}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="unqualified">Unqualified</option>
                      <option value="lost">Lost</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {userRole === "admin" ? (
                      <select
                        value={lead.assigned_to || ""}
                        onChange={(e) => handleAssign(lead.id, e.target.value)}
                        className="rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {salesUsers.map((u) => (
                          <option key={u.id} value={u.id}>{u.full_name}</option>
                        ))}
                      </select>
                    ) : (
                      lead.assigned_profile?.full_name || "Unassigned"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {!lead.assigned_to && (
                        <button
                          onClick={() => handleClaim(lead.id)}
                          title="Claim"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleDnc(lead.id, !!lead.do_not_call)}
                        title={lead.do_not_call ? "Remove Do Not Call" : "Mark Do Not Call"}
                        className={`rounded-lg p-1.5 cursor-pointer ${lead.do_not_call ? "bg-red-50 text-red-600 hover:bg-red-100" : "text-gray-400 hover:bg-red-50 hover:text-red-600"}`}
                      >
                        {lead.do_not_call ? <Phone className="h-4 w-4" /> : <PhoneOff className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handleConvert(lead.id)}
                        title="Convert to Deal"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600 cursor-pointer"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(lead.id)}
                        title="Delete"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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
