"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, ArrowLeft, FileText, CheckCircle2, PenTool, Eye, EyeOff } from "lucide-react";

interface FormField {
  key: string;
  label: string;
  type: string;
}

interface CompletedForm {
  id: string;
  step_key: string;
  file_name: string;
  form_data: Record<string, unknown> | null;
  template_name: string;
  template_description: string | null;
  form_fields: FormField[];
  created_at: string;
}

interface CandidateInfo {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_type: string;
  status: string;
}

const STEP_LABELS: Record<string, string> = {
  interview: "Interview Documents",
  welcome_docs: "Welcome & Onboarding Documents",
  application: "Application Documents",
};

export default function CandidateFormsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);
  const [forms, setForms] = useState<CompletedForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/onboarding/candidates/${id}/completed-forms`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCandidate(data.candidate);
        setForms(data.completed_forms);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  function toggleSensitive(key: string) {
    setShowSensitive((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-green-600" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-gray-500">Candidate not found</p>
      </div>
    );
  }

  const stepGroups = forms.reduce<Record<string, CompletedForm[]>>((acc, form) => {
    const key = form.step_key;
    if (!acc[key]) acc[key] = [];
    acc[key].push(form);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={() => router.push("/sales/candidates")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Candidates
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{candidate.full_name}</h1>
        <div className="flex items-center gap-3 mt-1">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            candidate.role_type === "BDP" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
          }`}>
            {candidate.role_type === "BDP" ? "BDP" : "Market Leader"}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            candidate.status === "completed" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
          }`}>
            {candidate.status}
          </span>
          {candidate.email && <span className="text-xs text-gray-400">{candidate.email}</span>}
        </div>
      </div>

      {forms.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">No completed forms yet.</p>
        </div>
      ) : (
        Object.entries(stepGroups).map(([stepKey, stepForms]) => (
          <div key={stepKey} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              {STEP_LABELS[stepKey] || stepKey}
            </h2>
            <div className="space-y-4">
              {stepForms.map((form) => (
                <div key={form.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <h3 className="text-sm font-semibold text-gray-900">{form.template_name}</h3>
                      </div>
                      {form.template_description && (
                        <p className="text-xs text-gray-500 mt-0.5 ml-6">{form.template_description}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(form.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>

                  {form.form_data && form.form_fields.length > 0 ? (
                    <div className="divide-y divide-gray-50">
                      {form.form_fields.map((field) => {
                        const val = form.form_data![field.key];
                        if (val === undefined || val === null || val === "") return null;

                        let display: React.ReactNode;
                        if (field.type === "checkbox") {
                          display = val ? "Yes" : "No";
                        } else if (field.type === "signature") {
                          display = (
                            <span className="flex items-center gap-1.5">
                              <PenTool className="h-3 w-3 text-gray-400" />
                              <span className="text-lg italic font-serif text-gray-700">{String(val)}</span>
                            </span>
                          );
                        } else if (field.type === "sensitive") {
                          const strVal = String(val);
                          const visible = showSensitive[`${form.id}-${field.key}`];
                          display = (
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-sm">
                                {visible ? strVal : "***" + strVal.slice(-4)}
                              </span>
                              <button
                                onClick={() => toggleSensitive(`${form.id}-${field.key}`)}
                                className="text-gray-400 hover:text-gray-600 cursor-pointer"
                              >
                                {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            </span>
                          );
                        } else {
                          display = String(val);
                        }

                        return (
                          <div key={field.key} className="px-5 py-3 flex items-start gap-4">
                            <span className="text-xs font-medium text-gray-500 w-48 flex-shrink-0 pt-0.5">{field.label}</span>
                            <span className="text-sm text-gray-900 flex-1">{display}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-5 py-4 text-sm text-gray-500">
                      Form submitted (file upload)
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
