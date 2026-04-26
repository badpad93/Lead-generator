"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Loader2, Plus, Trash2, FileText, ChevronUp, ChevronDown, Mail, Link2, ExternalLink, PenTool, CreditCard, ShieldCheck } from "lucide-react";

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
  requires_signature: boolean;
  requires_payment: boolean;
  requires_admin_approval: boolean;
  payment_amount: number | null;
  payment_description: string | null;
  pandadoc_preliminary_template_id: string | null;
  pandadoc_full_template_id: string | null;
  payment_provider: string;
  step_documents: StepDoc[];
}

interface Pipeline {
  id: string;
  name: string;
  type: string;
  pipeline_steps: Step[];
}

interface DocTemplate {
  id: string;
  name: string;
  file_name: string;
  version: number;
  active: boolean;
}

interface DocAssignment {
  id: string;
  step_key: string;
  document_template_id: string;
  document_templates: DocTemplate | null;
}

interface EmailTemplate {
  id: string;
  pipeline_type: string;
  step_key: string;
  subject: string;
  updated_at: string;
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
  const [docAssignments, setDocAssignments] = useState<DocAssignment[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);

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
    const pipelineType = `pipeline_${id}`;
    const [pRes, eRes] = await Promise.all([
      fetch(`/api/pipelines/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/onboarding/email-templates`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (pRes.ok) {
      const data = await pRes.json();
      setPipeline(data);
      setNameValue(data.name);

      // Fetch doc assignments for each step in parallel
      const stepAssignments = await Promise.all(
        (data.pipeline_steps || []).map(async (s: Step) => {
          const r = await fetch(
            `/api/onboarding/step-doc-assignments?pipeline_id=${id}&step_key=${s.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return r.ok ? await r.json() : [];
        })
      );
      setDocAssignments(stepAssignments.flat());
    }
    if (eRes.ok) {
      const allEmails: EmailTemplate[] = await eRes.json();
      setEmailTemplates(allEmails.filter((t) => t.pipeline_type === pipelineType));
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

  async function toggleStepGating(stepId: string, field: string, val: boolean) {
    await fetch(`/api/pipelines/${id}/steps`, { method: "POST", headers: headers(), body: JSON.stringify({ action: "update", step_id: stepId, [field]: val }) });
    load();
  }

  async function updatePaymentConfig(stepId: string, amount: number, description: string) {
    await fetch(`/api/pipelines/${id}/steps`, { method: "POST", headers: headers(), body: JSON.stringify({ action: "update", step_id: stepId, payment_amount: amount, payment_description: description }) });
    load();
  }

  async function updateStepField(stepId: string, field: string, value: string) {
    await fetch(`/api/pipelines/${id}/steps`, { method: "POST", headers: headers(), body: JSON.stringify({ action: "update", step_id: stepId, [field]: value || null }) });
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
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={step.requires_document} onChange={(e) => toggleDocRequired(step.id, e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300" />
                    <FileText className="h-3 w-3" /> Docs
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={step.requires_signature} onChange={(e) => toggleStepGating(step.id, "requires_signature", e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300" />
                    <PenTool className="h-3 w-3" /> E-Sign
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={step.requires_payment} onChange={(e) => toggleStepGating(step.id, "requires_payment", e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300" />
                    <CreditCard className="h-3 w-3" /> Payment
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={step.requires_admin_approval} onChange={(e) => toggleStepGating(step.id, "requires_admin_approval", e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300" />
                    <ShieldCheck className="h-3 w-3" /> Approval
                  </label>
                </div>
                <button onClick={() => deleteStep(step.id)} className="text-gray-300 hover:text-red-500 cursor-pointer"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Step documents (requirement checklist) */}
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

            {/* Payment Configuration */}
            {step.requires_payment && (
              <div className="ml-12 mt-3 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase flex items-center gap-1"><CreditCard className="h-3 w-3" /> Payment Config</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    defaultValue={step.payment_amount || ""}
                    onBlur={(e) => updatePaymentConfig(step.id, Number(e.target.value) || 0, step.payment_description || "")}
                    placeholder="Amount ($)"
                    className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-green-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    defaultValue={step.payment_description || ""}
                    onBlur={(e) => updatePaymentConfig(step.id, step.payment_amount || 0, e.target.value)}
                    placeholder="Payment description"
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Provider:</span>
                  <select
                    value={step.payment_provider || "none"}
                    onChange={(e) => updateStepField(step.id, "payment_provider", e.target.value)}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-green-500 focus:outline-none"
                  >
                    <option value="none">None</option>
                    <option value="pandadoc_stripe">PandaDoc + Stripe</option>
                    <option value="paypal">PayPal</option>
                  </select>
                </div>
              </div>
            )}

            {/* PandaDoc Template IDs (for proposal flow) */}
            {step.requires_signature && (
              <div className="ml-12 mt-3 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase flex items-center gap-1"><PenTool className="h-3 w-3" /> PandaDoc Templates</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    defaultValue={step.pandadoc_preliminary_template_id || ""}
                    onBlur={(e) => updateStepField(step.id, "pandadoc_preliminary_template_id", e.target.value)}
                    placeholder="Preliminary Template ID"
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-green-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    defaultValue={step.pandadoc_full_template_id || ""}
                    onBlur={(e) => updateStepField(step.id, "pandadoc_full_template_id", e.target.value)}
                    placeholder="Full Template ID"
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-green-500 focus:outline-none"
                  />
                </div>
                <p className="text-xs text-gray-400">Preliminary = before payment · Full = after payment (includes sensitive location details)</p>
              </div>
            )}

            {/* Linked Templates (doc + email) */}
            {(() => {
              const stepDocAssignments = docAssignments.filter((a) => a.step_key === step.id);
              const stepEmail = emailTemplates.find((t) => t.step_key === step.id);
              return (
                <div className="ml-12 mt-3 border-t border-dashed border-gray-100 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-500 uppercase">Linked Templates</p>
                    <Link href="/sales/admin/pipeline-doc-mapping" className="flex items-center gap-1 text-xs text-green-600 hover:underline cursor-pointer">
                      <Link2 className="h-3 w-3" /> Manage
                    </Link>
                  </div>

                  <div className="space-y-2">
                    {/* Document templates */}
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
                        <FileText className="h-3 w-3 text-gray-400" />
                        <span className="font-medium">Documents ({stepDocAssignments.length})</span>
                      </div>
                      {stepDocAssignments.length === 0 ? (
                        <p className="ml-4 text-xs text-gray-300">None linked. Use Doc Mapping to attach templates.</p>
                      ) : (
                        <div className="ml-4 space-y-1">
                          {stepDocAssignments.map((a) => (
                            <div key={a.id} className="flex items-center justify-between text-xs">
                              <span className="text-gray-700">
                                {a.document_templates?.name || "Unknown"}
                                {a.document_templates && (
                                  <span className="ml-1 text-gray-400">({a.document_templates.file_name} · v{a.document_templates.version})</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Email template */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Mail className="h-3 w-3 text-gray-400" />
                          <span className="font-medium">Email Template</span>
                        </div>
                        <Link href="/sales/admin/email-templates" className="flex items-center gap-1 text-xs text-green-600 hover:underline cursor-pointer">
                          <ExternalLink className="h-3 w-3" /> {stepEmail ? "Edit" : "Create"}
                        </Link>
                      </div>
                      {stepEmail ? (
                        <p className="ml-4 text-xs text-gray-700 truncate">{stepEmail.subject}</p>
                      ) : (
                        <p className="ml-4 text-xs text-gray-300">None linked. Use Email Templates to add one.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
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
