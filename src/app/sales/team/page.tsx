"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Users, Plus, Loader2, Search, UserCheck, UserX } from "lucide-react";

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  employee_documents: { id: string }[];
  created_at: string;
}

const ROLES = [
  { value: "sales_rep", label: "Sales Rep" },
  { value: "market_leader", label: "Market Leader" },
  { value: "admin", label: "Admin" },
  { value: "director_of_sales", label: "Director of Sales" },
  { value: "operations", label: "Operations" },
  { value: "support", label: "Support" },
];

export default function TeamPage() {
  const [token, setToken] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", role: "sales_rep" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/team", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setEmployees(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.full_name) return;
    setSaving(true);
    await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setForm({ full_name: "", email: "", phone: "", role: "sales_rep" });
    setShowAdd(false);
    setSaving(false);
    load();
  }

  const filtered = employees.filter((e) =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (e.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <span className="text-sm text-gray-400 ml-2">{employees.length} members</span>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Add Member
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team..."
          className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:border-green-500 focus:outline-none"
        />
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Team Member</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Full Name *"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            <input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
            >
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleAdd} disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Docs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <Link href={`/sales/team/${emp.id}`} className="font-medium text-gray-900 hover:text-green-600">
                      {emp.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{emp.role.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-gray-500">{emp.email || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${emp.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {emp.status === "active" ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                      {emp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{emp.employee_documents?.length || 0}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No team members found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
