"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Loader2, Upload, FileText, Trash2, CheckCircle2 } from "lucide-react";

interface EmployeeDoc {
  id: string;
  file_name: string;
  file_type: string | null;
  file_url: string;
  created_at: string;
}

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  employee_documents: EmployeeDoc[];
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

export default function TeamMemberPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", role: "", status: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, []);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    const res = await fetch(`/api/team/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setEmployee(data);
      setForm({
        full_name: data.full_name,
        email: data.email || "",
        phone: data.phone || "",
        role: data.role,
        status: data.status,
      });
    }
    setLoading(false);
  }, [token, id]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setEditing(false);
    setSaving(false);
    load();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    await fetch(`/api/team/${id}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
    setUploading(false);
    load();
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;
  if (!employee) return <p className="p-6 text-gray-400">Employee not found.</p>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={() => router.push("/sales/team")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to Team
      </button>

      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">{employee.full_name}</h1>
          <div className="flex gap-2">
            {!editing ? (
              <button onClick={() => setEditing(true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer">Edit</button>
            ) : (
              <>
                <button onClick={handleSave} disabled={saving} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">{saving ? "Saving..." : "Save"}</button>
                <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" placeholder="Full Name" />
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" placeholder="Email" />
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" placeholder="Phone" />
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-gray-400">Email</p><p className="font-medium text-gray-900">{employee.email || "—"}</p></div>
            <div><p className="text-gray-400">Phone</p><p className="font-medium text-gray-900">{employee.phone || "—"}</p></div>
            <div><p className="text-gray-400">Role</p><p className="font-medium text-gray-900 capitalize">{employee.role.replace(/_/g, " ")}</p></div>
            <div><p className="text-gray-400">Status</p><p className={`font-medium ${employee.status === "active" ? "text-green-600" : "text-gray-400"}`}>{employee.status}</p></div>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Documents</h2>
          <label className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 cursor-pointer">
            <Upload className="h-3 w-3" />
            {uploading ? "Uploading..." : "Upload"}
            <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
          </label>
        </div>

        {employee.employee_documents.length === 0 ? (
          <p className="text-sm text-gray-400">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {employee.employee_documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-900">{doc.file_name}</span>
                  <span className="text-xs text-gray-400">{doc.file_type}</span>
                </div>
                <span className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
