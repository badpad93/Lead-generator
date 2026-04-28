"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { Plus, Loader2, Search, X, Upload, UserPlus, ArrowRight, Trash2, FileText, Pencil, Download, Eye } from "lucide-react";

interface CandidateDoc {
  id: string;
  step_key: string;
  file_name: string;
  file_url?: string;
  file_type?: string;
}

interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_type: string;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  application_date: string | null;
  created_at: string;
  candidate_documents: CandidateDoc[];
  onboarding_pipelines: { id: string; name: string; role_type: string } | null;
  onboarding_steps: { id: string; name: string; step_key: string } | null;
}

interface SalesUser {
  id: string;
  full_name: string;
  role: string;
}

export default function CandidatesPage() {
  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", role_type: "BDP", assigned_to: "", notes: "" });
  const [addFiles, setAddFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [expandedDocsId, setExpandedDocsId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      setToken(session.access_token);
      setUserId(session.user.id);
      const res = await fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const users = await res.json();
        setSalesUsers(users);
        const me = users.find((u: SalesUser) => u.id === session.user.id);
        if (me) setUserRole(me.role);
      }
    });
  }, []);

  const fetchCandidates = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/onboarding/candidates", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setCandidates(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  const isElevated = userRole === "admin" || userRole === "director_of_sales";
  const assignableUsers = salesUsers.filter((u) => u.role === "admin" || u.role === "director_of_sales" || u.role === "market_leader");

  async function handleAdd() {
    if (!form.full_name) return;
    setSaving(true);
    const res = await fetch("/api/onboarding/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...form, pre_pipeline: true, assigned_to: form.assigned_to || null }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to add candidate");
    } else {
      const candidate = await res.json();
      if (addFiles.length > 0) {
        const failures: string[] = [];
        for (const file of addFiles) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("step_key", "application");
          const upRes = await fetch(`/api/onboarding/candidates/${candidate.id}/documents`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          if (!upRes.ok) {
            const upErr = await upRes.json().catch(() => ({}));
            failures.push(`${file.name}: ${upErr.error || `HTTP ${upRes.status}`}`);
          }
        }
        if (failures.length > 0) {
          setUploadError(`Some uploads failed: ${failures.join("; ")}`);
        }
      }
      setForm({ full_name: "", email: "", phone: "", role_type: "BDP", assigned_to: "", notes: "" });
      setAddFiles([]);
      setShowAdd(false);
      fetchCandidates();
    }
    setSaving(false);
  }

  async function handleAssign(id: string, assignTo: string) {
    await fetch(`/api/onboarding/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assigned_to: assignTo || null }),
    });
    fetchCandidates();
  }

  async function handleAddToPipeline(id: string) {
    if (!confirm("Add this candidate to the Hiring Pipeline? They will move to the Interview stage.")) return;
    const res = await fetch(`/api/onboarding/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "add_to_pipeline" }),
    });
    if (res.ok) {
      fetchCandidates();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to add to pipeline");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this candidate? This cannot be undone.")) return;
    await fetch(`/api/onboarding/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "terminated" }),
    });
    fetchCandidates();
  }

  async function handleUploadDoc(candidateId: string, file: File) {
    setUploadingId(candidateId);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("step_key", "application");
    const res = await fetch(`/api/onboarding/candidates/${candidateId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setUploadError(err.error || `Upload failed (${res.status})`);
    }
    setUploadingId(null);
    fetchCandidates();
  }

  async function handleDeleteDoc(candidateId: string, docId: string) {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/onboarding/candidates/${candidateId}/documents/${docId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchCandidates();
  }

  function openEdit(c: Candidate) {
    setEditForm({
      full_name: c.full_name || "",
      email: c.email || "",
      phone: c.phone || "",
      notes: c.notes || "",
    });
    setEditingId(c.id);
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setEditSaving(true);
    await fetch(`/api/onboarding/candidates/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(editForm),
    });
    setEditingId(null);
    setEditSaving(false);
    fetchCandidates();
  }

  const filtered = candidates.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (c.status === "terminated") return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return c.full_name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.phone || "").toLowerCase().includes(q);
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Add Candidate
        </button>
      </div>

      {showAdd && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">New Candidate</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input placeholder="Full Name *" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <select value={form.role_type} onChange={(e) => setForm((f) => ({ ...f, role_type: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
              <option value="BDP">Business Development Partner</option>
              <option value="MARKET_LEADER">Market Leader</option>
            </select>
            <select value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
              <option value="">Assign to...</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
              ))}
            </select>
          </div>
          <textarea placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" rows={2} />
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-500">Application Documents</label>
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-500 hover:border-green-400 hover:text-green-600 hover:bg-green-50/30 cursor-pointer transition-colors">
              <Upload className="h-4 w-4" />
              Choose Files
              <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.heif,.webp,.gif,.txt,.csv,.xls,.xlsx,.rtf" className="hidden" onChange={(e) => { if (e.target.files) setAddFiles((prev) => [...prev, ...Array.from(e.target.files!)]); e.target.value = ""; }} />
            </label>
            {addFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {addFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5 text-gray-700 truncate">
                      <FileText className="h-3.5 w-3.5 text-gray-400" />
                      {f.name}
                      <span className="text-gray-400">({(f.size / 1024).toFixed(0)} KB)</span>
                    </span>
                    <button onClick={() => setAddFiles((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 cursor-pointer">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">{saving ? "Saving..." : "Save"}</button>
            <button onClick={() => { setShowAdd(false); setAddFiles([]); }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidates..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-9 text-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
        >
          <option value="all">All Statuses</option>
          <option value="application">Application</option>
          <option value="interview">Interview</option>
          <option value="training">Training</option>
          <option value="active">Active</option>
        </select>
      </div>

      {uploadError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="ml-3 text-red-400 hover:text-red-600 cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <UserPlus className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No candidates yet. Add one above to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Contact</th>
                <th className="px-4 py-3 font-medium text-gray-500">Documents</th>
                <th className="px-4 py-3 font-medium text-gray-500">Assigned To</th>
                <th className="px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => {
                const appDocs = c.candidate_documents.filter((d) => d.step_key === "application");
                const assignedUser = salesUsers.find((u) => u.id === c.assigned_to);
                return (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(c)} className="text-left font-medium text-gray-900 hover:text-green-700 hover:underline cursor-pointer">
                        {c.full_name}
                      </button>
                      {c.notes && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{c.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.role_type === "BDP" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                      }`}>
                        {c.role_type === "BDP" ? "BDP" : "Market Leader"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.status === "application" ? "bg-gray-100 text-gray-600" :
                        c.status === "interview" ? "bg-yellow-50 text-yellow-700" :
                        c.status === "training" ? "bg-blue-50 text-blue-600" :
                        c.status === "active" ? "bg-green-50 text-green-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {c.status}
                      </span>
                      {c.onboarding_steps && (
                        <p className="text-xs text-gray-400 mt-0.5">{c.onboarding_steps.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="text-xs">
                        {c.email && <p>{c.email}</p>}
                        {c.phone && <p>{c.phone}</p>}
                        {!c.email && !c.phone && "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          {appDocs.length > 0 ? (
                            <button onClick={() => setExpandedDocsId(expandedDocsId === c.id ? null : c.id)} className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 cursor-pointer">
                              <FileText className="h-3.5 w-3.5" />
                              {appDocs.length} file{appDocs.length > 1 ? "s" : ""}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300">None</span>
                          )}
                          <label className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 cursor-pointer">
                            {uploadingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                            Upload
                            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.heif,.webp,.gif,.txt,.csv,.xls,.xlsx,.rtf" onChange={(e) => { if (e.target.files?.[0]) handleUploadDoc(c.id, e.target.files[0]); e.target.value = ""; }} />
                          </label>
                        </div>
                        {expandedDocsId === c.id && appDocs.length > 0 && (
                          <div className="space-y-1 rounded-lg border border-gray-100 bg-gray-50 p-2">
                            {appDocs.map((doc) => (
                              <div key={doc.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate max-w-[140px] text-gray-700" title={doc.file_name}>{doc.file_name}</span>
                                <div className="flex items-center gap-1">
                                  {doc.file_url && (
                                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" title="View" className="rounded p-0.5 text-gray-400 hover:text-blue-600">
                                      <Eye className="h-3 w-3" />
                                    </a>
                                  )}
                                  <button onClick={() => handleDeleteDoc(c.id, doc.id)} title="Delete" className="rounded p-0.5 text-gray-400 hover:text-red-600 cursor-pointer">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isElevated ? (
                        <select
                          value={c.assigned_to || ""}
                          onChange={(e) => handleAssign(c.id, e.target.value)}
                          className="rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer"
                        >
                          <option value="">Unassigned</option>
                          {assignableUsers.map((u) => (
                            <option key={u.id} value={u.id}>{u.full_name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-600">{assignedUser?.full_name || "Unassigned"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {c.application_date || new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(c)} title="Edit" className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 cursor-pointer">
                          <Pencil className="h-4 w-4" />
                        </button>
                        {c.status === "application" && (
                          <button
                            onClick={() => handleAddToPipeline(c.id)}
                            title="Add to Hiring Pipeline"
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600 cursor-pointer"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                        {isElevated && (
                          <button onClick={() => handleDelete(c.id)} title="Remove" className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Edit Candidate</h2>
              <button onClick={() => setEditingId(null)} className="rounded-lg p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">Full Name</span>
                <input value={editForm.full_name || ""} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">Email</span>
                <input value={editForm.email || ""} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-gray-500">Phone</span>
                <input value={editForm.phone || ""} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Notes</span>
              <textarea value={editForm.notes || ""} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            </label>
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => setEditingId(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button onClick={handleSaveEdit} disabled={editSaving} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">
                {editSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
