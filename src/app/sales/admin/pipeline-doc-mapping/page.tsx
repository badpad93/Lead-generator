"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Link2, Plus, Trash2, ChevronUp, ChevronDown, Upload } from "lucide-react";

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
  source: "onboarding" | "generic";
  steps: { key: string; label: string }[];
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
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadVersion, setUploadVersion] = useState("1");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [autoAssign, setAutoAssign] = useState(true);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/sales"); return; }
      setToken(session.access_token);
      fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.ok ? r.json() : [])
        .then((users: { id: string; role: string }[]) => {
          const me = users.find((u) => u.id === session.user.id);
          if (!me || me.role !== "admin") {
            router.push("/sales");
          } else {
            setAuthorized(true);
          }
        });
    });
  }, [router]);

  const loadPipelines = useCallback(async () => {
    if (!token) return;
    const [obRes, genRes] = await Promise.all([
      fetch("/api/onboarding/ob-pipelines", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/pipelines", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const all: Pipeline[] = [];
    if (obRes.ok) {
      const obData = await obRes.json();
      for (const p of obData) {
        all.push({
          id: p.id,
          name: p.name,
          role_type: p.role_type,
          source: "onboarding",
          steps: [
            { key: "interview", label: "Interview" },
            { key: "welcome_docs", label: "Welcome Docs" },
            { key: "completion", label: "Completion" },
          ],
        });
      }
    }
    if (genRes.ok) {
      const genData = await genRes.json();
      for (const p of genData) {
        if (p.type === "hiring") continue;
        all.push({
          id: p.id,
          name: p.name,
          role_type: p.type,
          source: "generic",
          steps: (p.pipeline_steps || [])
            .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
            .map((s: { id: string; name: string }) => ({ key: s.id, label: s.name })),
        });
      }
    }
    setPipelines(all);
    if (all.length > 0 && !selectedPipeline) {
      setSelectedPipeline(all[0].id);
      if (all[0].steps.length > 0) setSelectedStep(all[0].steps[0].key);
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
  const availableTemplates = allTemplates.filter((t) => {
    if (assignedIds.has(t.id) || !t.active) return false;
    if (t.step_key !== selectedStep) return false;
    if (t.pipeline_type === "ALL") return true;
    if (currentPipeline?.source === "onboarding") return t.pipeline_type === currentPipeline.role_type;
    return t.pipeline_type === `pipeline_${currentPipeline?.id}` || t.pipeline_type === "ALL";
  });

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

  async function handleUpload() {
    if (!uploadFile || !uploadName.trim() || !currentPipeline) {
      alert("Name and file are required");
      return;
    }
    const pipelineType = currentPipeline.source === "onboarding"
      ? currentPipeline.role_type
      : `pipeline_${currentPipeline.id}`;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("name", uploadName.trim());
      fd.append("pipeline_type", pipelineType);
      fd.append("step_key", selectedStep);
      fd.append("version", uploadVersion || "1");

      const res = await fetch("/api/onboarding/document-templates", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Upload failed");
        return;
      }

      const newTemplate = await res.json();

      if (autoAssign) {
        await fetch("/api/onboarding/step-doc-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: "assign",
            pipeline_id: selectedPipeline,
            step_key: selectedStep,
            document_template_id: newTemplate.id,
            required: true,
            order_index: assignments.length,
          }),
        });
      }

      setUploadName("");
      setUploadVersion("1");
      setUploadFile(null);
      setShowUpload(false);
      await loadTemplates();
      await loadAssignments();
    } finally {
      setUploading(false);
    }
  }

  const sortedAssignments = [...assignments].sort((a, b) => a.order_index - b.order_index);

  if (!authorized) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link2 className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Pipeline Document Mapping</h1>
        </div>
        <button
          onClick={() => setShowUpload((s) => !s)}
          disabled={!currentPipeline}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
        >
          <Upload className="h-4 w-4" />
          Upload New Template
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Assign which document templates are sent at each pipeline step. Only assigned documents will be attached to emails.
      </p>

      {showUpload && currentPipeline && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Upload Template</h3>
          <p className="text-xs text-gray-500 mb-3">
            Will be added to <span className="font-medium">{currentPipeline.name}</span> · step <span className="font-medium">{currentPipeline.steps.find((s) => s.key === selectedStep)?.label || selectedStep}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Document name *"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            <input
              type="number"
              min={1}
              placeholder="Version"
              value={uploadVersion}
              onChange={(e) => setUploadVersion(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </div>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.heif,.webp,.gif,.txt,.csv,.xls,.xlsx,.rtf"
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            className="mt-3 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-50"
          />
          <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={autoAssign}
              onChange={(e) => setAutoAssign(e.target.checked)}
              className="rounded border-gray-300 cursor-pointer"
            />
            Assign to this step after upload
          </label>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
            <button
              onClick={() => setShowUpload(false)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Selectors */}
      <div className="flex gap-3 mb-6">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Pipeline</label>
          <select
            value={selectedPipeline}
            onChange={(e) => {
              const pid = e.target.value;
              setSelectedPipeline(pid);
              const p = pipelines.find((pp) => pp.id === pid);
              if (p && p.steps.length > 0) setSelectedStep(p.steps[0].key);
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.source === "onboarding" ? p.role_type : p.role_type})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Step</label>
          <select
            value={selectedStep}
            onChange={(e) => setSelectedStep(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
          >
            {(currentPipeline?.steps || []).map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
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
