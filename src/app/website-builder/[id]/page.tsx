"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, ArrowLeft, ArrowRight, Save, CheckCircle2, AlertCircle,
  Globe, Building2, Palette, Package, FileText, Image as ImageIcon,
  Mail, Server, Sparkles, ListChecks, Send,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import WizardBusinessStep from "@/app/components/website-builder/WizardBusinessStep";
import WizardBrandStep from "@/app/components/website-builder/WizardBrandStep";
import WizardProductsStep from "@/app/components/website-builder/WizardProductsStep";
import WizardContentStep from "@/app/components/website-builder/WizardContentStep";
import WizardMediaStep from "@/app/components/website-builder/WizardMediaStep";
import WizardContactStep from "@/app/components/website-builder/WizardContactStep";
import WizardDomainStep from "@/app/components/website-builder/WizardDomainStep";
import WizardFeaturesStep from "@/app/components/website-builder/WizardFeaturesStep";
import WizardLaunchStep from "@/app/components/website-builder/WizardLaunchStep";
import WizardReviewStep from "@/app/components/website-builder/WizardReviewStep";
import type {
  WebsiteRequest, WebsiteRequestMedia, WebsiteRequestActivity,
} from "@/app/components/website-builder/types";

const STEPS = [
  { key: "business", label: "Business", icon: Building2 },
  { key: "brand", label: "Brand", icon: Palette },
  { key: "products", label: "Products & Customers", icon: Package },
  { key: "content", label: "Website Content", icon: FileText },
  { key: "media", label: "Media", icon: ImageIcon },
  { key: "contact", label: "Contact & Leads", icon: Mail },
  { key: "domain", label: "Domain & Tech", icon: Server },
  { key: "features", label: "Features", icon: Sparkles },
  { key: "launch", label: "Launch Readiness", icon: ListChecks },
  { key: "review", label: "Review & Submit", icon: Send },
] as const;

export default function WebsiteBuilderWizard() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitMissing, setSubmitMissing] = useState<string[]>([]);
  const [request, setRequest] = useState<WebsiteRequest | null>(null);
  const [media, setMedia] = useState<WebsiteRequestMedia[]>([]);
  const [activity, setActivity] = useState<WebsiteRequestActivity[]>([]);

  const dirtyRef = useRef<Record<string, unknown>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async (t: string) => {
    const res = await fetch(`/api/website-requests/${id}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Failed to load");
      return null;
    }
    const body = await res.json();
    setRequest(body.request);
    setMedia(body.media || []);
    setActivity(body.activity || []);
    return body;
  }, [id]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) { router.push(`/login?redirect=/website-builder/${id}`); return; }
      setToken(session.access_token);
      await reload(session.access_token);
      setLoading(false);
    });
  }, [router, id, reload]);

  /**
   * Autosave: whenever a step calls updateField, we merge into dirtyRef
   * and debounce a PATCH. Step changes flush immediately so back/forward
   * navigation always saves.
   */
  const flush = useCallback(async () => {
    const patch = { ...dirtyRef.current };
    dirtyRef.current = {};
    if (Object.keys(patch).length === 0) return;
    setSaving("saving");
    const res = await fetch(`/api/website-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setSaving("error");
      setError((await res.json().catch(() => ({}))).error || "Save failed");
      return;
    }
    const body = await res.json();
    setRequest(body.request);
    setSaving("saved");
    setTimeout(() => setSaving("idle"), 1500);
  }, [id, token]);

  const updateField = useCallback((key: string, value: unknown) => {
    setRequest((prev) => (prev ? { ...prev, [key]: value } : prev));
    dirtyRef.current[key] = value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void flush(); }, 800);
  }, [flush]);

  const goToStep = useCallback(async (nextIndex: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await flush();
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, nextIndex)));
  }, [flush]);

  async function handleSubmit() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await flush();
    setSubmitting(true);
    setSubmitMissing([]);
    setError(null);
    const res = await fetch(`/api/website-requests/${id}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (Array.isArray(body.missing)) setSubmitMissing(body.missing);
      setError(body.error || "Submission failed");
      return;
    }
    await reload(token);
  }

  const currentStep = STEPS[stepIndex];
  const isReadOnly = useMemo(() => {
    if (!request) return true;
    return request.status !== "draft" && request.status !== "needs_information";
  }, [request]);

  if (loading || !request) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link href="/website-builder" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Requests
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <Globe className="h-5 w-5 text-green-700" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{request.business_name || "Your Website Request"}</h1>
            <p className="text-sm text-gray-500">
              Step {stepIndex + 1} of {STEPS.length} — {currentStep.label}
            </p>
          </div>
          <div className="text-xs text-gray-400 whitespace-nowrap">
            {saving === "saving" && (<><Loader2 className="inline h-3 w-3 animate-spin mr-1" /> Saving…</>)}
            {saving === "saved" && (<><CheckCircle2 className="inline h-3 w-3 mr-1 text-emerald-600" /> Saved</>)}
            {saving === "error" && (<><AlertCircle className="inline h-3 w-3 mr-1 text-red-500" /> Save error</>)}
          </div>
        </div>

        {request.status === "needs_information" && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Action Required
            </p>
            <p className="text-xs text-amber-800 mt-1">
              Our team requested additional information on this request. Update the relevant sections
              and resubmit when ready.
            </p>
          </div>
        )}

        {isReadOnly && request.status !== "needs_information" && (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">This request has been submitted</p>
            <p className="text-xs text-blue-800 mt-1">
              Current status: <strong>{request.status.replace(/_/g, " ")}</strong>. Contact support
              to make changes.
            </p>
          </div>
        )}

        {/* Progress rail */}
        <div className="mb-6 grid grid-cols-5 sm:grid-cols-10 gap-1">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => void goToStep(i)}
              className={`h-2 rounded-full transition-colors ${i <= stepIndex ? "bg-green-primary" : "bg-gray-200 hover:bg-gray-300"}`}
              title={s.label}
              aria-label={`Go to step ${i + 1}: ${s.label}`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p>{error}</p>
              {submitMissing.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-xs">
                  {submitMissing.map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8">
          {currentStep.key === "business" && (
            <WizardBusinessStep request={request} updateField={updateField} isReadOnly={isReadOnly} />
          )}
          {currentStep.key === "brand" && (
            <WizardBrandStep
              request={request} updateField={updateField} isReadOnly={isReadOnly}
              media={media} token={token} onMediaChange={() => reload(token)}
            />
          )}
          {currentStep.key === "products" && (
            <WizardProductsStep request={request} updateField={updateField} isReadOnly={isReadOnly} />
          )}
          {currentStep.key === "content" && (
            <WizardContentStep request={request} updateField={updateField} isReadOnly={isReadOnly} />
          )}
          {currentStep.key === "media" && (
            <WizardMediaStep
              request={request} isReadOnly={isReadOnly}
              media={media} token={token} onMediaChange={() => reload(token)}
              updateField={updateField}
            />
          )}
          {currentStep.key === "contact" && (
            <WizardContactStep request={request} updateField={updateField} isReadOnly={isReadOnly} />
          )}
          {currentStep.key === "domain" && (
            <WizardDomainStep request={request} updateField={updateField} isReadOnly={isReadOnly} />
          )}
          {currentStep.key === "features" && (
            <WizardFeaturesStep request={request} updateField={updateField} isReadOnly={isReadOnly} />
          )}
          {currentStep.key === "launch" && (
            <WizardLaunchStep request={request} updateField={updateField} isReadOnly={isReadOnly} />
          )}
          {currentStep.key === "review" && (
            <WizardReviewStep
              request={request} media={media} activity={activity}
              updateField={updateField} isReadOnly={isReadOnly}
              onEditStep={(k) => {
                const idx = STEPS.findIndex((s) => s.key === k);
                if (idx >= 0) void goToStep(idx);
              }}
              onSubmit={handleSubmit}
              submitting={submitting}
            />
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => void goToStep(stepIndex - 1)}
            disabled={stepIndex === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            type="button"
            onClick={() => void flush()}
            disabled={saving === "saving"}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
          >
            <Save className="h-4 w-4" /> Save Draft
          </button>
          {stepIndex < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => void goToStep(stepIndex + 1)}
              className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-5 py-2.5 text-sm font-semibold text-white cursor-pointer"
            >
              Save & Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="w-32" />
          )}
        </div>
      </div>
    </div>
  );
}
