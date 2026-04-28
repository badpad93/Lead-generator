"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Mail, Save, Eye, Plus } from "lucide-react";

interface EmailTemplate {
  id: string;
  pipeline_type: string;
  step_key: string;
  subject: string;
  body_html: string;
  updated_at: string;
}

interface GenericPipeline {
  id: string;
  name: string;
  type: string;
  pipeline_steps: { id: string; name: string; order_index: number }[];
}

export default function AdminEmailTemplatesPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [allPipelines, setAllPipelines] = useState<GenericPipeline[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ pipeline_type: "BDP", step_key: "interview", subject: "", body_html: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/sales"); return; }
      setToken(session.access_token);
      fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.ok ? r.json() : [])
        .then((users: { id: string; role: string }[]) => {
          const me = users.find((u) => u.id === session.user.id);
          if (!me || (me.role !== "admin" && me.role !== "director_of_sales" && me.role !== "market_leader")) {
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
    const res = await fetch("/api/onboarding/email-templates", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function startEdit(t: EmailTemplate) {
    setEditingId(t.id);
    setEditSubject(t.subject);
    setEditBody(t.body_html);
  }

  async function handleSave(id: string) {
    setSaving(true);
    await fetch(`/api/onboarding/email-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject: editSubject, body_html: editBody }),
    });
    setEditingId(null);
    setSaving(false);
    load();
  }

  async function handleCreate() {
    if (!addForm.subject || !addForm.body_html) return;
    setCreating(true);
    await fetch("/api/onboarding/email-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(addForm),
    });
    setAddForm({ pipeline_type: "BDP", step_key: "interview", subject: "", body_html: "" });
    setShowAdd(false);
    setCreating(false);
    load();
  }

  const pipelineTypeOptions = [
    { value: "BDP", label: "BDP" },
    { value: "MARKET_LEADER", label: "Market Leader" },
    ...allPipelines.map((p) => ({ value: `pipeline_${p.id}`, label: p.name })),
  ];

  const stepOptions = [
    { value: "interview", label: "Interview" },
    { value: "welcome_docs", label: "Welcome Docs" },
    ...allPipelines.flatMap((p) =>
      (p.pipeline_steps || []).map((s) => ({ value: s.id, label: `${p.name} — ${s.name}` }))
    ),
  ];

  function stepLabel(stepKey: string): string {
    if (stepKey === "interview") return "Interview";
    if (stepKey === "welcome_docs") return "Welcome Docs";
    for (const p of allPipelines) {
      const s = (p.pipeline_steps || []).find((s) => s.id === stepKey);
      if (s) return s.name;
    }
    return stepKey.replace(/_/g, " ");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Mail className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">
          <Plus className="h-4 w-4" /> New Template
        </button>
      </div>

      {showAdd && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Email Template</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Pipeline Type</label>
              <select value={addForm.pipeline_type} onChange={(e) => setAddForm((f) => ({ ...f, pipeline_type: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
                {pipelineTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Step</label>
              <select value={addForm.step_key} onChange={(e) => setAddForm((f) => ({ ...f, step_key: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
                {stepOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs text-gray-500 mb-1 block">Subject</label>
            <input value={addForm.subject} onChange={(e) => setAddForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Email subject line" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
          </div>
          <div className="mt-3">
            <label className="text-xs text-gray-500 mb-1 block">Body HTML</label>
            <textarea value={addForm.body_html} onChange={(e) => setAddForm((f) => ({ ...f, body_html: e.target.value }))} rows={6} placeholder="Use {{candidate_name}} for name placeholder" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-green-500 focus:outline-none" />
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleCreate} disabled={creating || !addForm.subject || !addForm.body_html} className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">
              {creating ? "Creating..." : "Create"}
            </button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {!authorized || loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>
      ) : (
        <div className="space-y-4">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    t.pipeline_type === "BDP" ? "bg-blue-50 text-blue-600" :
                    t.pipeline_type === "MARKET_LEADER" ? "bg-purple-50 text-purple-600" :
                    "bg-green-50 text-green-600"
                  }`}>{
                    t.pipeline_type.startsWith("pipeline_")
                      ? allPipelines.find((p) => `pipeline_${p.id}` === t.pipeline_type)?.name || t.pipeline_type
                      : t.pipeline_type
                  }</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 capitalize">{stepLabel(t.step_key)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {editingId !== t.id && (
                    <>
                      <button onClick={() => setPreviewId(previewId === t.id ? null : t.id)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </button>
                      <button onClick={() => startEdit(t)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer">Edit</button>
                    </>
                  )}
                </div>
              </div>

              {editingId === t.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Subject</label>
                    <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Body HTML</label>
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={10} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-green-500 focus:outline-none" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSave(t.id)} disabled={saving} className="flex items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-900">{t.subject}</p>
                  <p className="text-xs text-gray-400 mt-1">Updated: {new Date(t.updated_at).toLocaleDateString()}</p>
                </>
              )}

              {previewId === t.id && editingId !== t.id && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs text-gray-500 mb-2">Preview ({"{{candidate_name}}"} will be replaced):</p>
                  <div className="text-sm" dangerouslySetInnerHTML={{ __html: t.body_html.replace(/\{\{candidate_name\}\}/g, "John Doe") }} />
                </div>
              )}
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-center text-gray-400 py-12">No email templates found.</p>
          )}
        </div>
      )}
    </div>
  );
}
