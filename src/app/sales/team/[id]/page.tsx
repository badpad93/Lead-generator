"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import {
  ArrowLeft, Loader2, Upload, FileText, CheckCircle2, Circle, Clock,
  Send, ShieldCheck, GraduationCap, UserX, AlertTriangle, Mail, XCircle,
} from "lucide-react";

interface CandidateDoc {
  id: string;
  step_key: string;
  file_name: string;
  file_type: string | null;
  file_url: string;
  created_at: string;
}

interface EmailLog {
  id: string;
  step_key: string;
  recipient_email: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  attachment_count: number;
  sent_at: string;
}

interface StepInfo {
  id: string;
  name: string;
  step_key: string;
  order_index: number;
}

interface Candidate {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role_type: string;
  application_date: string | null;
  interview_date: string | null;
  interview_time: string | null;
  status: string;
  current_pipeline_id: string | null;
  current_step_id: string | null;
  onboarding_completed_at: string | null;
  assigned_training_pipeline_id: string | null;
  terminated_at: string | null;
  created_at: string;
  onboarding_pipelines: { id: string; name: string; role_type: string } | null;
  onboarding_steps: StepInfo | null;
  candidate_documents: CandidateDoc[];
  all_steps: StepInfo[];
  email_logs: EmailLog[];
}

interface TrainingPipeline {
  id: string;
  name: string;
  type: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  interview: { label: "Interview", color: "bg-blue-50 text-blue-700" },
  pending_admin_review_1: { label: "Pending Admin Review", color: "bg-amber-50 text-amber-700" },
  welcome_docs_sent: { label: "Welcome Docs Step", color: "bg-purple-50 text-purple-700" },
  pending_admin_review_2: { label: "Pending Admin Review", color: "bg-amber-50 text-amber-700" },
  completed: { label: "Onboarding Complete", color: "bg-green-50 text-green-700" },
  assigned_to_training: { label: "Assigned to Training", color: "bg-emerald-50 text-emerald-700" },
  terminated: { label: "Terminated", color: "bg-red-50 text-red-600" },
};

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [uploadingStep, setUploadingStep] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", interview_date: "", interview_time: "" });
  const [saving, setSaving] = useState(false);
  const [trainingPipelines, setTrainingPipelines] = useState<TrainingPipeline[]>([]);
  const [selectedTraining, setSelectedTraining] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const [terminateReason, setTerminateReason] = useState("");
  const [terminating, setTerminating] = useState(false);
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

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    const res = await fetch(`/api/onboarding/candidates/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setCandidate(data);
      setForm({
        full_name: data.full_name || "",
        phone: data.phone || "",
        email: data.email || "",
        interview_date: data.interview_date || "",
        interview_time: data.interview_time || "",
      });
    }
    setLoading(false);
  }, [token, id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!token || !candidate || candidate.status !== "completed") return;
    fetch("/api/pipelines", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setTrainingPipelines(data));
  }, [token, candidate]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/onboarding/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setEditing(false);
    setSaving(false);
    load();
  }

  async function handleSendDocs() {
    setSending(true);
    setActionError(null);
    setActionSuccess(null);
    const res = await fetch(`/api/onboarding/candidates/${id}/send-docs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) {
      setActionSuccess(`Documents sent successfully (${data.attachmentCount} attachments)`);
      load();
    } else {
      setActionError(data.error || "Failed to send documents");
    }
    setSending(false);
  }

  async function handleApprove() {
    setApproving(true);
    setActionError(null);
    setActionSuccess(null);
    const res = await fetch(`/api/onboarding/candidates/${id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) {
      setActionSuccess("Approved! Step unlocked.");
      load();
    } else {
      setActionError(data.error || "Approval failed");
    }
    setApproving(false);
  }

  async function handleUploadDoc(stepKey: string, file: File) {
    setUploadingStep(stepKey);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("step_key", stepKey);
    await fetch(`/api/onboarding/candidates/${id}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    setUploadingStep(null);
    load();
  }

  async function handleAssignTraining() {
    if (!selectedTraining) return;
    setAssigning(true);
    setActionError(null);
    const res = await fetch(`/api/onboarding/candidates/${id}/assign-training`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pipeline_id: selectedTraining }),
    });
    if (res.ok) {
      setActionSuccess("Assigned to training pipeline!");
      load();
    } else {
      const data = await res.json();
      setActionError(data.error || "Failed to assign");
    }
    setAssigning(false);
  }

  async function handleTerminate() {
    setTerminating(true);
    setActionError(null);
    const res = await fetch(`/api/onboarding/candidates/${id}/terminate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: terminateReason }),
    });
    if (res.ok) {
      setShowTerminate(false);
      load();
    } else {
      const data = await res.json();
      setActionError(data.error || "Termination failed");
    }
    setTerminating(false);
  }

  if (!authorized || loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;
  if (!candidate) return <p className="p-6 text-gray-400">Candidate not found.</p>;

  const currentStepIdx = candidate.all_steps.findIndex((s) => s.id === candidate.current_step_id);
  const isTerminated = candidate.status === "terminated";

  const interviewDocs = candidate.candidate_documents.filter((d) => d.step_key === "interview");
  const welcomeDocs = candidate.candidate_documents.filter((d) => d.step_key === "welcome_docs");
  const resumeDocs = candidate.candidate_documents.filter((d) => d.step_key === "resume");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => router.push("/sales/team")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to Team
      </button>

      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{candidate.full_name}</h1>
            <p className="text-sm text-gray-500">{candidate.role_type === "BDP" ? "Business Development Partner" : "Market Leader"}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CONFIG[candidate.status]?.color || "bg-gray-100 text-gray-500"}`}>
              {STATUS_CONFIG[candidate.status]?.label || candidate.status}
            </span>
            {!editing && !isTerminated && (
              <button onClick={() => setEditing(true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer">Edit</button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Full Name *</label>
              <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email</label>
              <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Interview Date</label>
              <input type="date" value={form.interview_date} onChange={(e) => setForm((f) => ({ ...f, interview_date: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Interview Time</label>
              <input type="time" value={form.interview_time} onChange={(e) => setForm((f) => ({ ...f, interview_time: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">{saving ? "Saving..." : "Save"}</button>
              <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mt-2">
            <div><p className="text-gray-400">Email</p><p className="font-medium text-gray-900">{candidate.email || "—"}</p></div>
            <div><p className="text-gray-400">Phone</p><p className="font-medium text-gray-900">{candidate.phone || "—"}</p></div>
            <div><p className="text-gray-400">Application Date</p><p className="font-medium text-gray-900">{candidate.application_date || "—"}</p></div>
            <div><p className="text-gray-400">Interview Date</p><p className="font-medium text-gray-900">{candidate.interview_date || "—"}</p></div>
            <div><p className="text-gray-400">Interview Time</p><p className="font-medium text-gray-900">{candidate.interview_time || "—"}</p></div>
            <div><p className="text-gray-400">Pipeline</p><p className="font-medium text-gray-900">{candidate.onboarding_pipelines?.name || "—"}</p></div>
          </div>
        )}
      </div>

      {/* Pipeline Progress */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Hiring & Onboarding Progress</h2>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700 uppercase mr-1 flex-shrink-0">Hiring</span>
          {candidate.all_steps.map((step, i) => {
            const isCurrent = step.id === candidate.current_step_id;
            const isPast = i < currentStepIdx;
            const isOnboardingStart = step.step_key === "welcome_docs";
            return (
              <div key={step.id} className="flex items-center gap-1 flex-shrink-0">
                {isOnboardingStart && (
                  <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold text-green-700 uppercase mx-1">Onboarding</span>
                )}
                {i > 0 && !isOnboardingStart && <div className={`h-0.5 w-8 ${isPast || isCurrent ? "bg-green-400" : "bg-gray-200"}`} />}
                <div className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium ${
                  isCurrent ? "bg-green-600 text-white" :
                  isPast ? "bg-green-100 text-green-700" :
                  "bg-gray-100 text-gray-400"
                }`}>
                  {isPast ? <CheckCircle2 className="h-3.5 w-3.5" /> : isCurrent ? <Circle className="h-3.5 w-3.5 fill-white" /> : <Circle className="h-3.5 w-3.5" />}
                  {step.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action messages */}
      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-6">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            <span>{actionError}</span>
          </div>
        </div>
      )}
      {actionSuccess && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 mb-6">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            <span>{actionSuccess}</span>
          </div>
        </div>
      )}

      {/* Step Actions */}
      {!isTerminated && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Current Step Actions</h2>

          {/* STEP 1: Interview */}
          {candidate.status === "interview" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Complete candidate details and upload resume, then send NDA / NCA / Agreement documents.</p>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingStep === "resume" ? "Uploading..." : "Upload Resume"}
                  <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUploadDoc("resume", e.target.files[0]); }} />
                </label>
                {resumeDocs.length > 0 && (
                  <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Resume uploaded</span>
                )}
              </div>
              <button
                onClick={handleSendDocs}
                disabled={sending}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send NDA / NCA / Agreement
              </button>
            </div>
          )}

          {/* ADMIN REVIEW 1 */}
          {candidate.status === "pending_admin_review_1" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-2">
                  <Clock className="h-4 w-4" />
                  Waiting for signed documents
                </div>
                <p className="text-xs text-amber-700">Upload the returned NDA, NCA, and Agreement documents, then approve to unlock the next step.</p>
              </div>
              <div className="space-y-2">
                {["NDA", "NCA", "Agreement"].map((docName) => {
                  const found = interviewDocs.find((d) => d.file_name.toLowerCase().includes(docName.toLowerCase()));
                  return (
                    <div key={docName} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${found ? "border-green-200 bg-green-50" : "border-gray-200"}`}>
                      <div className="flex items-center gap-2">
                        {found ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <FileText className="h-4 w-4 text-gray-400" />}
                        <span className="text-sm text-gray-900">{docName}</span>
                        {found && <span className="text-xs text-green-600">{found.file_name}</span>}
                      </div>
                      {!found && (
                        <label className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 cursor-pointer">
                          {uploadingStep === "interview" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          Upload
                          <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUploadDoc("interview", e.target.files[0]); }} />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Approve and Unlock Next Step
              </button>
            </div>
          )}

          {/* STEP 2: Welcome Docs */}
          {candidate.status === "welcome_docs_sent" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Send the welcome email with ACH and W9 form attachments.</p>
              <button
                onClick={handleSendDocs}
                disabled={sending}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Welcome Email with ACH and W9
              </button>
            </div>
          )}

          {/* ADMIN REVIEW 2 */}
          {candidate.status === "pending_admin_review_2" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-2">
                  <Clock className="h-4 w-4" />
                  Waiting for completed ACH and W9
                </div>
                <p className="text-xs text-amber-700">Upload the returned ACH and W9 forms, then approve to complete onboarding.</p>
              </div>
              <div className="space-y-2">
                {["ACH", "W9"].map((docName) => {
                  const found = welcomeDocs.find((d) => d.file_name.toLowerCase().includes(docName.toLowerCase()));
                  return (
                    <div key={docName} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${found ? "border-green-200 bg-green-50" : "border-gray-200"}`}>
                      <div className="flex items-center gap-2">
                        {found ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <FileText className="h-4 w-4 text-gray-400" />}
                        <span className="text-sm text-gray-900">{docName}</span>
                        {found && <span className="text-xs text-green-600">{found.file_name}</span>}
                      </div>
                      {!found && (
                        <label className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 cursor-pointer">
                          {uploadingStep === "welcome_docs" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          Upload
                          <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUploadDoc("welcome_docs", e.target.files[0]); }} />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Approve and Complete Onboarding
              </button>
            </div>
          )}

          {/* STEP 3: Completion */}
          {candidate.status === "completed" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-green-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Success! You have successfully onboarded {candidate.full_name}.
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Assign to Training Pipeline</label>
                <div className="flex gap-2">
                  <select
                    value={selectedTraining}
                    onChange={(e) => setSelectedTraining(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">Select a pipeline...</option>
                    {trainingPipelines.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssignTraining}
                    disabled={assigning || !selectedTraining}
                    className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                  >
                    {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
                    Assign to Training
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Assigned to training */}
          {candidate.status === "assigned_to_training" && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <GraduationCap className="h-4 w-4" />
                Assigned to training pipeline.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Documents */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Documents</h2>
        {[
          { key: "resume", label: "Resume", docs: resumeDocs },
          { key: "interview", label: "Interview Documents (NDA, NCA, Agreement)", docs: interviewDocs },
          { key: "welcome_docs", label: "Welcome Documents (ACH, W9)", docs: welcomeDocs },
        ].map((group) => (
          <div key={group.key} className="mb-4 last:mb-0">
            <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">{group.label}</h3>
            {group.docs.length === 0 ? (
              <p className="text-xs text-gray-300 ml-2">No documents uploaded</p>
            ) : (
              <div className="space-y-1.5">
                {group.docs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-900">{doc.file_name}</span>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Email History */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Email History</h2>
        {candidate.email_logs.length === 0 ? (
          <p className="text-sm text-gray-400">No emails sent yet.</p>
        ) : (
          <div className="space-y-2">
            {candidate.email_logs.map((log) => (
              <div key={log.id} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${log.status === "success" ? "border-green-100" : "border-red-100 bg-red-50/50"}`}>
                <div className="flex items-center gap-2">
                  {log.status === "success" ? <Mail className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  <div>
                    <p className="text-sm text-gray-900">{log.subject || log.step_key}</p>
                    <p className="text-xs text-gray-400">{log.recipient_email} · {log.attachment_count} attachments</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-medium ${log.status === "success" ? "text-green-600" : "text-red-500"}`}>{log.status}</span>
                  <p className="text-xs text-gray-400">{new Date(log.sent_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Terminate */}
      {!isTerminated && candidate.status !== "assigned_to_training" && (
        <div className="rounded-xl border border-red-200 bg-white p-6">
          {!showTerminate ? (
            <button
              onClick={() => setShowTerminate(true)}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 cursor-pointer"
            >
              <UserX className="h-4 w-4" /> Terminate Candidate
            </button>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-red-700">Terminate {candidate.full_name}?</h3>
              <p className="text-xs text-gray-500">This will remove the candidate from active onboarding. The record will be preserved for reporting.</p>
              <textarea
                value={terminateReason}
                onChange={(e) => setTerminateReason(e.target.value)}
                placeholder="Reason for termination (optional)"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleTerminate}
                  disabled={terminating}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                >
                  {terminating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                  Confirm Termination
                </button>
                <button onClick={() => setShowTerminate(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {isTerminated && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700">
            <UserX className="h-4 w-4" />
            Terminated on {candidate.terminated_at ? new Date(candidate.terminated_at).toLocaleDateString() : "—"}
          </div>
        </div>
      )}
    </div>
  );
}
