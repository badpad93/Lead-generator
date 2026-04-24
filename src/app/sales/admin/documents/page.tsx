"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Upload, FileText, CheckCircle2, XCircle, Plus } from "lucide-react";

interface DocTemplate {
  id: string;
  name: string;
  pipeline_type: string;
  step_key: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  version: number;
  active: boolean;
  created_at: string;
}

interface GenericPipeline {
  id: string;
  name: string;
  type: string;
  pipeline_steps: { id: string; name: string; order_index: number }[];
}

export default function AdminDocumentsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ name: "", pipeline_type: "ALL", step_key: "interview", version: "1" });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterStep, setFilterStep] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [allPipelines, setAllPipelines] = useState<GenericPipeline[]>([]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/sales"); return; }
      setToken(session.access_token);
      fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.ok ? r.json() : [])
        .then((users: { id: string; role: string }[]) => {
          const me = users.find((u) => u.id === session.user.id);
          if (!me || (me.role !== "admin" && me.role !== "director_of_sales")) {
            router.push("/sales");
          } else {
            setAuthorized(true);
            fetch("/api/pipelines", { headers: { Authorization: `Bearer ${session.access_token}` } })
              .then((r) => r.ok ? r.json() : [])
              .then((data) => setAllPipelines(data));
          }
        });
    });
  }, [router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    let url = "/api/onboarding/document-templates?";
    if (filterType) url += `pipeline_type=${filterType}&`;
    if (filterStep) url += `step_key=${filterStep}&`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }, [token, filterType, filterStep]);

  useEffect(() => { load(); }, [load]);

  const allStepOptions = [
    { value: "interview", label: "Interview" },
    { value: "welcome_docs", label: "Welcome Docs" },
    ...allPipelines.flatMap((p) =>
      p.pipeline_steps.map((s) => ({ value: `pipeline_${p.id}_${s.id}`, label: `${p.name} — ${s.name}` }))
    ),
  ];

  const pipelineTypeOptions = [
    { value: "ALL", label: "All Pipelines" },
    { value: "BDP", label: "BDP Only" },
    { value: "MARKET_LEADER", label: "Market Leader Only" },
    ...allPipelines.map((p) => ({ value: `pipeline_${p.id}`, label: p.name })),
  ];

  async function handleUpload() {
    if (!file || !form.name) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", form.name);
    formData.append("pipeline_type", form.pipeline_type);
    formData.append("step_key", form.step_key);
    formData.append("version", form.version);
    await fetch("/api/onboarding/document-templates", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    setFile(null);
    setForm({ name: "", pipeline_type: "ALL", step_key: "interview", version: "1" });
    setShowUpload(false);
    setUploading(false);
    load();
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/onboarding/document-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ active }),
    });
    load();
  }

  if (!authorized) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Document Templates</h1>
        </div>
        <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Upload Template
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Upload New Template</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input placeholder="Document Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <select value={form.pipeline_type} onChange={(e) => setForm((f) => ({ ...f, pipeline_type: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
              {pipelineTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select value={form.step_key} onChange={(e) => setForm((f) => ({ ...f, step_key: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
              {allStepOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input placeholder="Version" type="number" value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <label className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 cursor-pointer hover:border-green-400">
              <Upload className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">{file ? file.name : "Choose PDF file *"}</span>
              <input type="file" accept=".pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleUpload} disabled={uploading || !file || !form.name} className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">
              {uploading ? "Uploading..." : "Upload"}
            </button>
            <button onClick={() => setShowUpload(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
          <option value="">All Types</option>
          {pipelineTypeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={filterStep} onChange={(e) => setFilterStep(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
          <option value="">All Steps</option>
          {allStepOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Pipeline</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Step</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">File</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Version</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.pipeline_type === "BDP" ? "bg-blue-50 text-blue-600" :
                      t.pipeline_type === "MARKET_LEADER" ? "bg-purple-50 text-purple-600" :
                      "bg-gray-100 text-gray-600"
                    }`}>{t.pipeline_type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{t.step_key.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{t.file_name}</td>
                  <td className="px-4 py-3 text-gray-500">v{t.version}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(t.id, !t.active)}
                      className="cursor-pointer"
                    >
                      {t.active
                        ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                        : <XCircle className="h-5 w-5 text-gray-300" />
                      }
                    </button>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No templates uploaded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
