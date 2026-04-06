"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  FileSpreadsheet,
  MapPin,
  Users as UsersIcon,
  Upload,
} from "lucide-react";

type Category = "locations" | "operators";

interface CallList {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  sheet_url: string | null;
  file_url: string | null;
  file_name: string | null;
  assigned_to: string | null;
  created_at: string;
  assigned_profile?: { full_name: string | null; email: string | null } | null;
}

interface SalesUserRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function CallListsPage() {
  const [token, setToken] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [salesUsers, setSalesUsers] = useState<SalesUserRow[]>([]);
  const [lists, setLists] = useState<CallList[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Category>("locations");
  const [showAdd, setShowAdd] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    sheet_url: "",
    assigned_to: "",
    file: null as File | null,
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      setToken(session.access_token);
      const res = await fetch("/api/sales/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const users: SalesUserRow[] = await res.json();
        setSalesUsers(users);
        const me = users.find((u) => u.id === session.user.id);
        if (me?.role === "admin") setIsAdmin(true);
      }
    });
  }, []);

  const fetchLists = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`/api/sales/call-lists?category=${tab}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setLists(await res.json());
    setLoading(false);
  }, [token, tab]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  async function handleSave() {
    if (!form.title.trim()) {
      alert("Title is required");
      return;
    }
    if (!form.sheet_url.trim() && !form.file) {
      alert("Provide a Google Sheets URL or upload an Excel file");
      return;
    }
    setUploading(true);
    try {
      let file_url: string | null = null;
      let file_name: string | null = null;

      if (form.file) {
        const supabase = (await import("@/lib/supabase")).createBrowserClient();
        const safeName = form.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `call-lists/${tab}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(filePath, form.file, {
            upsert: false,
            contentType: form.file.type || undefined,
          });
        if (upErr) {
          alert(`Upload failed: ${upErr.message}`);
          return;
        }
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(filePath);
        file_url = urlData.publicUrl;
        file_name = form.file.name;
      }

      const res = await fetch("/api/sales/call-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: tab,
          sheet_url: form.sheet_url.trim() || null,
          file_url,
          file_name,
          assigned_to: form.assigned_to || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to save");
        return;
      }
      setForm({ title: "", description: "", sheet_url: "", assigned_to: "", file: null });
      setShowAdd(false);
      fetchLists();
    } finally {
      setUploading(false);
    }
  }

  async function handleAssign(id: string, userId: string) {
    await fetch(`/api/sales/call-lists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assigned_to: userId || null }),
    });
    fetchLists();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this call list?")) return;
    const res = await fetch(`/api/sales/call-lists/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to delete");
      return;
    }
    fetchLists();
  }

  const tabs: { value: Category; label: string; icon: typeof MapPin }[] = [
    { value: "locations", label: "Locations", icon: MapPin },
    { value: "operators", label: "Vending Machine Operators", icon: UsersIcon },
  ];

  const salesOnly = salesUsers.filter((u) => u.role === "sales" || u.role === "admin");

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call Lists</h1>
          <p className="text-sm text-gray-500 mt-1">
            Google Sheets and Excel spreadsheets assigned to sales reps for outreach.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            New Call List
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 rounded-xl border border-gray-200 bg-white p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                active ? "bg-green-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {showAdd && isAdmin && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            New {tab === "locations" ? "Locations" : "Operators"} Call List
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Title *"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            <select
              value={form.assigned_to}
              onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {salesOnly.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            rows={2}
          />
          <input
            placeholder="Google Sheets URL (paste link)"
            value={form.sheet_url}
            onChange={(e) => setForm((f) => ({ ...f, sheet_url: e.target.value }))}
            className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
          <div className="mt-3">
            <label className="text-xs text-gray-500 mb-1 block">Or upload an Excel / CSV file</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.ods"
              onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSave}
              disabled={uploading}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {uploading ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-green-600" />
        </div>
      ) : lists.length === 0 ? (
        <div className="py-16 text-center">
          <FileSpreadsheet className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">
            No {tab} call lists yet.
            {isAdmin && " Click New Call List to add one."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Title</th>
                <th className="px-4 py-3 font-medium text-gray-500">Source</th>
                <th className="px-4 py-3 font-medium text-gray-500">Assigned To</th>
                <th className="px-4 py-3 font-medium text-gray-500">Added</th>
                <th className="px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lists.map((list) => (
                <tr key={list.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{list.title}</div>
                    {list.description && (
                      <div className="text-xs text-gray-500 mt-0.5">{list.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {list.sheet_url && (
                        <a
                          href={list.sheet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Google Sheet
                        </a>
                      )}
                      {list.file_url && (
                        <a
                          href={list.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={list.file_name || undefined}
                          className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
                        >
                          <Upload className="h-3 w-3" />
                          {list.file_name || "File"}
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {isAdmin ? (
                      <select
                        value={list.assigned_to || ""}
                        onChange={(e) => handleAssign(list.id, e.target.value)}
                        className="rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {salesOnly.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || u.email}
                          </option>
                        ))}
                      </select>
                    ) : (
                      list.assigned_profile?.full_name || "Unassigned"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(list.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(list.id)}
                        title="Delete"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
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
