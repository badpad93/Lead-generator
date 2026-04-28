"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import {
  ArrowLeft, Loader2, Save, Plus, Trash2, FileText, Mail, Eye,
  ChevronUp, ChevronDown, CheckCircle2, XCircle, Send, ShieldCheck, GraduationCap,
} from "lucide-react";

interface Pipeline {
  id: string;
  name: string;
  role_type: string;
  onboarding_steps: { id: string; name: string; step_key: string; order_index: number }[];
}

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

interface EmailTemplate {
  id: string;
  pipeline_type: string;
  step_key: string;
  subject: string;
  body_html: string;
}

const STEP_CONFIG: Record<string, { icon: React.ElementType; color: string; description: string }> = {
  interview: {
    icon: Send,
    color: "bg-blue-50 border-blue-200 text-blue-700",
    description: "Candidate enters pipeline. Collect info, upload resume, then send NDA / NCA / Agreement via email. Admin reviews and uploads returned signed documents before unlocking next step.",
  },
  welcome_docs: {
    icon: ShieldCheck,
    color: "bg-purple-50 border-purple-200 text-purple-700",
    description: "Send welcome email with ACH and W9 form attachments. Admin reviews and uploads returned completed forms before unlocking completion.",
  },
  completion: {
    icon: GraduationCap,
    color: "bg-green-50 border-green-200 text-green-700",
    description: "Onboarding complete. Candidate can be assigned to a training pipeline.",
  },
};

export default function OnboardingEditPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState("");
  const [allTemplates, setAllTemplates] = useState<DocTemplate[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>({});
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [previewEmail, setPreviewEmail] = useState<string | null>(null);

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

  const loadEmailTemplates = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/onboarding/email-templates", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setEmailTemplates(await res.json());
  }, [token]);

  const loadAssignments = useCallback(async () => {
    if (!token || !selectedPipeline) return;
    setLoading(true);
    const result: Record<string, Assignment[]> = {};
    for (const stepKey of ["interview", "welcome_docs"]) {
      const res = await fetch(
        `/api/onboarding/step-doc-assignments?pipeline_id=${selectedPipeline}&step_key=${stepKey}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) result[stepKey] = await res.json();
      else result[stepKey] = [];
    }
    setAssignments(result);
    setLoading(false);
  }, [token, selectedPipeline]);

  useEffect(() => { loadPipelines(); loadTemplates(); loadEmailTemplates(); }, [loadPipelines, loadTemplates, loadEmailTemplates]);
  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  const currentPipeline = pipelines.find((p) => p.id === selectedPipeline);
  const steps = currentPipeline?.onboarding_steps || [];

  async function handleAssign(stepKey: string, templateId: string) {
    const current = assignments[stepKey] || [];
    await fetch("/api/onboarding/step-doc-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: "assign",
        pipeline_id: selectedPipeline,
        step_key: stepKey,
        document_template_id: templateId,
        required: true,
        order_index: current.length,
      }),
    });
    loadAssignments();
  }

  async function handleRemoveAssignment(assignmentId: string) {
    await fetch("/api/onboarding/step-doc-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "remove", assignment_id: assignmentId }),
    });
    loadAssignments();
  }

  async function handleReorder(stepKey: string, assignmentId: string, direction: "up" | "down") {
    const sorted = [...(assignments[stepKey] || [])].sort((a, b) => a.order_index - b.order_index);
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

  function startEditEmail(t: EmailTemplate) {
    setEditingEmail(t.id);
    setEditSubject(t.subject);
    setEditBody(t.body_html);
  }

  async function saveEmail(id: string) {
    setSavingEmail(true);
    await fetch(`/api/onboarding/email-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject: editSubject, body_html: editBody }),
    });
    setEditingEmail(null);
    setSavingEmail(false);
    loadEmailTemplates();
  }

  function getAvailableTemplates(stepKey: string) {
    const assignedIds = new Set((assignments[stepKey] || []).map((a) => a.document_template_id));
    return allTemplates.filter((t) =>
      !assignedIds.has(t.id) &&
      t.active &&
      t.step_key === stepKey &&
      (t.pipeline_type === currentPipeline?.role_type || t.pipeline_type === "ALL")
    );
  }

  function getEmailTemplate(stepKey: string) {
    return emailTemplates.find(
      (t) => t.step_key === stepKey && t.pipeline_type === currentPipeline?.role_type
    );
  }

  if (!authorized) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => router.push("/sales/pipelines/onboarding")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to Onboarding
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Edit Onboarding Workflow</h1>
      </div>

      {/* Pipeline selector */}
      <div className="flex gap-2 mb-6">
        {pipelines.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedPipeline(p.id)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
              selectedPipeline === p.id
                ? "bg-green-600 text-white"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {p.name} ({p.role_type})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>
      ) : (
        <div className="space-y-6">
          {steps.map((step, i) => {
            const config = STEP_CONFIG[step.step_key] || STEP_CONFIG.completion;
            const StepIcon = config.icon;
            const stepAssignments = [...(assignments[step.step_key] || [])].sort((a, b) => a.order_index - b.order_index);
            const available = getAvailableTemplates(step.step_key);
            const emailTmpl = getEmailTemplate(step.step_key);
            const hasDocConfig = step.step_key === "interview" || step.step_key === "welcome_docs";

            return (
              <div key={step.id} className={`rounded-xl border-2 ${config.color} p-6`}>
                {/* Step header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-sm font-bold">
                    {i + 1}
                  </div>
                  <StepIcon className="h-5 w-5" />
                  <h2 className="text-lg font-semibold">{step.name}</h2>
                </div>
                <p className="text-sm opacity-80 mb-4">{config.description}</p>

                {hasDocConfig && (
                  <>
                    {/* Document assignments */}
                    <div className="rounded-lg bg-white p-4 mb-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-500" />
                        Document Attachments
                      </h3>

                      {stepAssignments.length === 0 ? (
                        <p className="text-xs text-gray-400 mb-3">No documents assigned — emails for this step won&apos;t have attachments.</p>
                      ) : (
                        <div className="space-y-2 mb-3">
                          {stepAssignments.map((a, idx) => (
                            <div key={a.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col gap-0.5">
                                  <button onClick={() => handleReorder(step.step_key, a.id, "up")} disabled={idx === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 cursor-pointer"><ChevronUp className="h-3 w-3" /></button>
                                  <button onClick={() => handleReorder(step.step_key, a.id, "down")} disabled={idx === stepAssignments.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 cursor-pointer"><ChevronDown className="h-3 w-3" /></button>
                                </div>
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                <div>
                                  <span className="text-sm font-medium text-gray-900">{a.document_templates?.name}</span>
                                  <span className="text-xs text-gray-500 ml-2">{a.document_templates?.file_name} · v{a.document_templates?.version}</span>
                                </div>
                              </div>
                              <button onClick={() => handleRemoveAssignment(a.id)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {available.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-2">Available templates:</p>
                          <div className="flex flex-wrap gap-2">
                            {available.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => handleAssign(step.step_key, t.id)}
                                className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:border-green-400 hover:text-green-600 cursor-pointer"
                              >
                                <Plus className="h-3 w-3" /> {t.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Email template */}
                    <div className="rounded-lg bg-white p-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-500" />
                        Email Template
                      </h3>

                      {emailTmpl ? (
                        editingEmail === emailTmpl.id ? (
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">Subject</label>
                              <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">Body HTML</label>
                              <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={8} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-green-500 focus:outline-none" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => saveEmail(emailTmpl.id)} disabled={savingEmail} className="flex items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-xs text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">
                                {savingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                              </button>
                              <button onClick={() => setEditingEmail(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-medium text-gray-900">{emailTmpl.subject}</p>
                              <div className="flex gap-2">
                                <button onClick={() => setPreviewEmail(previewEmail === emailTmpl.id ? null : emailTmpl.id)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
                                  <Eye className="h-3 w-3" /> Preview
                                </button>
                                <button onClick={() => startEditEmail(emailTmpl)} className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer">Edit</button>
                              </div>
                            </div>
                            {previewEmail === emailTmpl.id && (
                              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <p className="text-xs text-gray-500 mb-2">{"{{candidate_name}}"} will be replaced with actual name:</p>
                                <div className="text-sm" dangerouslySetInnerHTML={{ __html: emailTmpl.body_html.replace(/\{\{candidate_name\}\}/g, "John Doe") }} />
                              </div>
                            )}
                          </div>
                        )
                      ) : (
                        <p className="text-xs text-gray-400">No email template configured for this step.</p>
                      )}
                    </div>
                  </>
                )}

                {step.step_key === "completion" && (
                  <div className="rounded-lg bg-white p-4">
                    <p className="text-sm text-gray-600">No document or email configuration needed. This step displays a success message and allows assigning the candidate to a training pipeline.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
