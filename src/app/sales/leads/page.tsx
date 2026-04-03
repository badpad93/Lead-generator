"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { Plus, Loader2, Search, X, UserPlus, ArrowRight } from "lucide-react";
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
  const [addForm, setAddForm] = useState({ business_name: "", contact_name: "", phone: "", email: "", address: "" });

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
    await fetch("/api/sales/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(addForm),
    });
    setAddForm({ business_name: "", contact_name: "", phone: "", email: "", address: "" });
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

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/sales/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    fetchLeads();
  }

  const filtered = leads.filter((l) =>
    !search || l.business_name.toLowerCase().includes(search.toLowerCase()) ||
    (l.contact_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusColor: Record<string, string> = {
    new: "bg-blue-50 text-blue-700 ring-blue-200",
    contacted: "bg-yellow-50 text-yellow-700 ring-yellow-200",
    qualified: "bg-green-50 text-green-700 ring-green-200",
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
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">Save</button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search leads..."
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        )}
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
                  <td className="px-4 py-3 text-gray-600">{lead.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset cursor-pointer ${statusColor[lead.status] || ""}`}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
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
                        onClick={() => handleConvert(lead.id)}
                        title="Convert to Deal"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600 cursor-pointer"
                      >
                        <ArrowRight className="h-4 w-4" />
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
