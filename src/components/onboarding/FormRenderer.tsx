"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, PenTool, Eye, EyeOff } from "lucide-react";

export interface FormField {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "date" | "textarea" | "select" | "checkbox" | "signature" | "sensitive" | "number";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

interface FormRendererProps {
  templateId: string;
  templateName: string;
  description: string | null;
  fields: FormField[];
  token: string;
  onComplete: (advanced: boolean) => void;
  prefill?: Record<string, string>;
  alreadyCompleted?: boolean;
  existingData?: Record<string, unknown> | null;
}

export default function FormRenderer({
  templateId,
  templateName,
  description,
  fields,
  token,
  onComplete,
  prefill,
  alreadyCompleted,
  existingData,
}: FormRendererProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    if (existingData) return { ...existingData };
    const initial: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.type === "checkbox") {
        initial[field.key] = false;
      } else if (prefill?.[field.key]) {
        initial[field.key] = prefill[field.key];
      } else {
        initial[field.key] = "";
      }
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(alreadyCompleted || false);
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});

  function setValue(key: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSensitive(key: string) {
    setShowSensitive((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit() {
    setError(null);

    // Client-side validation
    for (const field of fields) {
      if (field.required) {
        const val = formData[field.key];
        if (val === undefined || val === null || val === "" || val === false) {
          setError(`"${field.label}" is required`);
          return;
        }
      }
    }

    // Validate confirm fields match
    if (formData["confirm_account_number"] !== undefined && formData["account_number"] !== undefined) {
      if (formData["confirm_account_number"] !== formData["account_number"]) {
        setError("Account numbers do not match");
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/onboarding/candidate-portal/${token}/submit-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_template_id: templateId, form_data: formData }),
      });

      if (res.ok) {
        const result = await res.json();
        setCompleted(true);
        onComplete(result.advanced);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Submission failed");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="font-medium text-green-800">{templateName} — Completed</span>
        </div>
        <p className="text-sm text-green-600 ml-7">This form has been submitted successfully.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Form Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-base font-semibold text-gray-900">{templateName}</h3>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>

      {/* Form Fields */}
      <div className="px-5 py-4 space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            {field.type === "checkbox" ? (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!formData[field.key]}
                  onChange={(e) => setValue(field.key, e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                />
                <span className="text-sm text-gray-700 leading-relaxed">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-0.5">*</span>}
                </span>
              </label>
            ) : field.type === "signature" ? (
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
                  <PenTool className="h-3 w-3" />
                  {field.label}
                  {field.required && <span className="text-red-400">*</span>}
                </label>
                <input
                  type="text"
                  value={(formData[field.key] as string) || ""}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  placeholder={field.placeholder || "Type your full legal name to sign"}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg font-serif italic text-gray-700 placeholder:text-gray-300 placeholder:not-italic focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                {formData[field.key] ? (
                  <p className="mt-1 text-xs text-gray-400">
                    Electronic signature: <span className="italic font-serif text-gray-600">{String(formData[field.key])}</span>
                  </p>
                ) : null}
              </div>
            ) : field.type === "select" ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <select
                  value={(formData[field.key] as string) || ""}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
                >
                  <option value="">Select...</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            ) : field.type === "textarea" ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <textarea
                  value={(formData[field.key] as string) || ""}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none resize-none"
                />
              </div>
            ) : field.type === "sensitive" ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <div className="relative">
                  <input
                    type={showSensitive[field.key] ? "text" : "password"}
                    value={(formData[field.key] as string) || ""}
                    onChange={(e) => setValue(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    autoComplete="off"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 pr-10 text-sm focus:border-green-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSensitive(field.key)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showSensitive[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <input
                  type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}
                  value={(formData[field.key] as string) || ""}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/30">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</span>
          ) : (
            <span className="flex items-center justify-center gap-2"><CheckCircle2 className="h-4 w-4" /> Complete & Submit</span>
          )}
        </button>
      </div>
    </div>
  );
}
