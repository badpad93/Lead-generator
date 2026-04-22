"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Loader2, Plus, Trash2, GripVertical, FileText, ChevronUp, ChevronDown } from "lucide-react";

interface StepDoc {
  id: string;
  name: string;
  file_type: string | null;
  required: boolean;
}

interface Step {
  id: string;
  name: string;
  order_index: number;
  requires_document: boolean;
  step_documents: StepDoc[];
}

interface Pipeline {
  id: string;
  name: string;
  type: string;
  pipeline_steps: Step[];
}

export default function PipelineEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [addingStep, setAddingStep] = useState(false);
  const [newStepName, setNewStepName] = useState("");
  const [addingDocTo, setAddingDocTo] = useState<string | null>(null);
  const [newDocName, setNewDocName] = useState("");

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, []);

  const headers = useCallback(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    const res = await fetch(`/api/pipelines/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setPipeline(data);
      setNameValue(data.name);
    }
    setLoading(false);
  }, [token, id]);

  useEffect(() => { load(); }, [load]);

  async function saveName() {
    await fetch(`/api/pipelines/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ name: nameValue }) });
    setEditingName(false);
    load();
  }

  async function addStep() {
    if (!newStepName) return;
    await fetch(`/api/pipelines/${id}/steps`, { method: "POST", headers: headers(), body: JSON.stringify({ name: newStepName }) });
    setNewStepName("");
    setAddingStep(false);
    load();
  }

  async function deleteStep(stepId: string) {
    await fetch(`/api/pipelines/${id}/steps`, { method: "POST", headers: headers(), body: JSON.stringify({ action: "delete", step_id: stepId }) });
    load();
  }

  async function toggleDocRequired(stepId: string, val: boolean) {
    await fetch(`/api/pipelines/${id}/steps`, { method: "POST", headers: headers(), body: JSON.stringify({ action: "update", step_id: stepId, requires_document: val }) });
    load();
  }

  async function moveStep(stepId: string, dir: "up" | "down") {
    if (!pipeline) return;
    const steps = [...pipeline.pipeline_steps];
    const idx = steps.findIndex((s) => s.id === stepId);
    if (dir === "up" && idx > 0) {
      [steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]];
    } else if (dir === "down" && idx < steps.length - 1) {
      [steps[idx], steps[idx + 1]] = [steps[idx + 1], steps[idx]];
    } else return;

    const reordered = steps.map((s, i) => ({ id: s.id, order_index: i }));
    await fetch(`/api/pipelines/${id}/steps`, { method: "POST", headers: headers(), body: JSON.stringify({ action: "reorder", steps: reordered }) });
    load();
  }

  async function addDoc(stepId: string) {
    if (!newDocName) return;
    await fetch(`/api/pipelines/${id}/steps`, { method: "POST", headers: headers(), body: JSON.stringify({ action: "add_document", step_id: stepId, doc_name: newDocName, required: true }) });
    setNewDocName("");
    setAddingDocTo(null);
    load();
  }

  async function removeDoc(docId: string) {
    await fetch(`/api/pipelines/${id}/steps`, { method: "POST", headers: headers(), body: JSON.stringify({ action: "remove_document", document_id: docId }) });
    load();
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;
  if (!pipeline) return <p className="p-6 text-gray-400">Pipeline not found.</p>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={() => router.push("/sales/pipelines")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to Pipelines
      </button>

      {/* Pipeline name */}
      <div className="flex items-center gap-3 mb-6">
        {editingName ? (
          <div className="flex items-center gap-2">
            <input value={nameValue} onChange={(e) => setNameValue(e.target.value)} className="text-2xl font-bold border-b-2 border-green-500 outline-none bg-transparent" />
            <button onClick={saveName} className="text-sm text-green-600 hover:underline cursor-pointer">Save</button>
            <button onClick={() => setEditingName(false)} className="text-sm text-gray-400 hover:underline cursor-pointer">Cancel</button>
          </div>
        ) : (
          <h1 className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-green-600" onClick={() => setEditingName(true)}>
            {pipeline.name}
            <span className="ml-2 text-xs text-gray-400">(click to rename)</span>
          </h1>
        )}
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pipeline.type === "hiring" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}`}>
          {pipeline.type}
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {pipeline.pipeline_steps.map((step, i) => (
          <div key={step.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveStep(step.id, "up")} disabled={i === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 cursor-pointer"><ChevronUp className="h-3 w-3" /></button>
                  <button onClick={() => moveStep(step.id, "down")} disabled={i === pipeline.pipeline_steps.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 cursor-pointer"><ChevronDown className="h-3 w-3" /></button>
                </div>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">{i + 1}</div>
                <span className="font-medium text-gray-900">{step.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={step.requires_document}
                    onChange={(e) => toggleDocRequired(step.id, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  Requires docs
                </label>
                <button onClick={() => deleteStep(step.id)} className="text-gray-300 hover:text-red-500 cursor-pointer"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Step documents */}
            {step.requires_document && (
              <div className="ml-12 mt-3 space-y-1.5">
                {step.step_documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <FileText className="h-3 w-3 text-gray-400" />
                      <span className="text-gray-700">{doc.name}</span>
                      {doc.required && <span className="text-red-400">*</span>}
                    </div>
                    <button onClick={() => removeDoc(doc.id)} className="text-gray-300 hover:text-red-500 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
                {addingDocTo === step.id ? (
                  <div className="flex items-center gap-2">
                    <input value={newDocName} onChange={(e) => setNewDocName(e.target.value)} placeholder="Document name" className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:border-green-500 focus:outline-none" />
                    <button onClick={() => addDoc(step.id)} className="text-xs text-green-600 hover:underline cursor-pointer">Add</button>
                    <button onClick={() => setAddingDocTo(null)} className="text-xs text-gray-400 hover:underline cursor-pointer">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => { setAddingDocTo(step.id); setNewDocName(""); }} className="flex items-center gap-1 text-xs text-green-600 hover:underline cursor-pointer">
                    <Plus className="h-3 w-3" /> Add required document
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add step */}
      <div className="mt-4">
        {addingStep ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-green-300 bg-green-50/50 p-4">
            <input value={newStepName} onChange={(e) => setNewStepName(e.target.value)} placeholder="Step name" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <button onClick={addStep} className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 cursor-pointer">Add Step</button>
            <button onClick={() => setAddingStep(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAddingStep(true)} className="flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-green-400 hover:text-green-600 w-full justify-center cursor-pointer">
            <Plus className="h-4 w-4" /> Add Step
          </button>
        )}
      </div>
    </div>
  );
}
