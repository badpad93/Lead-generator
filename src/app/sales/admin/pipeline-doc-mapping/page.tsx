"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Link2, Plus, Trash2, ChevronUp, ChevronDown, CheckCircle2, XCircle } from "lucide-react";

interface DocTemplate {
  id: string;
  name: string;
  pipeline_type: string;
  step_key: string;
  file_name: string;
  version: number;
  active: boolean;
}

interface Assignment {
  id: string;
  pipeline_id: string;
  step_key: string;
  document_template_id: string;
  required: boolean;
  order_index: number;
  document_templates: DocTemplate | null;
}

interface Pipeline {
  id: string;
  name: string;
  role_type: string;
}

export default function PipelineDocMappingPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [allTemplates, setAllTemplates] = useState<DocTemplate[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPipeline, setSelectedPipeline] = useState("");
  const [selectedStep, setSelectedStep] = useState("interview");
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState(false);

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
          }
        });
    });
  }, [router]);

  const loadPipelines = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/onboarding/ob-pipelines", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setPipelines(data);
      if (data.length > 0 && !selectedPipeline) setSelectedPipeline(data[0].id);
    }
  }, [token, selectedPipeline]);

  const loadTemplates = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/onboarding/document-templates", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setAllTemplates(await res.json());
  }, [token]);

  const loadAssignments = useCallback(async () => {
    if (!token || !selectedPipeline) return;
    setLoading(true);
    const res = await fetch(`/api/onboarding/step-doc-assignments?pipeline_id=${selectedPipeline}&step_key=${selectedStep}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setAssignments(await res.json());
    setLoading(false);
  }, [token, selectedPipeline, selectedStep]);

  useEffect(() => { loadPipelines(); loadTemplates(); }, [loadPipelines, loadTemplates]);
  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  const assignedIds = new Set(assignments.map((a) => a.document_template_id));
  const currentPipeline = pipelines.find((p) => p.id === selectedPipeline);
  const availableTemplates = allTemplates.filter((t) =>
    !assignedIds.has(t.id) &&
    t.active &&
    (t.pipeline_type === currentPipeline?.role_type || t.pipeline_type === "ALL") &&
    t.step_key === selectedStep
  );

  async function handleAssign(templateId: string) {
    setSaving(true);
    await fetch("/api/onboarding/step-doc-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: "assign",
        pipeline_id: selectedPipeline,
        step_key: selectedStep,
        document_template_id: templateId,
        required: true,
        order_index: assignments.length,
      }),
    });
    setSaving(false);
    loadAssignments();
  }

  async function handleRemove(assignmentId: string) {
    await fetch("/api/onboarding/step-doc-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "remove", assignment_id: assignmentId }),
    });
    loadAssignments();
  }

  async function handleReorder(assignmentId: string, direction: "up" | "down") {
    const sorted = [...assignments].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex((a) => a.id === assignmentId);
    if (direction === "up" && idx > 0) {
      [sorted[idx - 1], sorted[idx]] = [sorted[idx], sorted[idx - 1]];
    } else if (direction === "down" && idx < sorted.length - 1) {
      [sorted[idx], sorted[idx + 1]] = [sorted[idx + 1], sorted[idx]];
    } else return;

    const reordered = sorted.map((a, i) => ({ id: a.id, order_index: i }));
    await fetch("/api/onboarding/step-doc-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "reorder", assignments: reordered }),
    });
    loadAssignments();
  }

  const sortedAssignments = [...assignments].sort((a, b) => a.order_index - b.order_index);

  if (!authorized) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link2 className="h-6 w-6 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">Pipeline Document Mapping</h1>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Assign which document templates are sent at each pipeline step. Only assigned documents will be attached to emails.
      </p>

      {/* Selectors */}
      <div className="flex gap-3 mb-6">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Pipeline</label>
          <select
            value={selectedPipeline}
            onChange={(e) => setSelectedPipeline(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
          >
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role_type})</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Step</label>
          <select
            value={selectedStep}
            onChange={(e) => setSelectedStep(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
          >
            <option value="interview">Interview</option>
            <option value="welcome_docs">Welcome Docs</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assigned documents */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Assigned Documents ({sortedAssignments.length})
          </h2>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
          ) : sortedAssignments.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No documents assigned to this step yet.</p>
          ) : (
            <div className="space-y-2">
              {sortedAssignments.map((a, i) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => handleReorder(a.id, "up")} disabled={i === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 cursor-pointer"><ChevronUp className="h-3 w-3" /></button>
                      <button onClick={() => handleReorder(a.id, "down")} disabled={i === sortedAssignments.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 cursor-pointer"><ChevronDown className="h-3 w-3" /></button>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.document_templates?.name || "Unknown"}</p>
                      <p className="text-xs text-gray-500">
                        {a.document_templates?.file_name} · v{a.document_templates?.version}
                        {a.document_templates?.active
                          ? <span className="ml-1 text-green-600">Active</span>
                          : <span className="ml-1 text-red-500">Inactive</span>
                        }
                      </p>
                    </div>
                  </div>
                  <button onClick={() => handleRemove(a.id)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available documents */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Available Templates ({availableTemplates.length})
          </h2>
          {availableTemplates.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No unassigned templates available for this step/pipeline.</p>
          ) : (
            <div className="space-y-2">
              {availableTemplates.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.file_name} · v{t.version} · {t.pipeline_type}</p>
                  </div>
                  <button
                    onClick={() => handleAssign(t.id)}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" /> Assign
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
