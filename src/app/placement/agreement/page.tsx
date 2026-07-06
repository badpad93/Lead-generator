"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, FileSignature, ArrowLeft, CheckCircle2, AlertCircle, Clock, XCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Template {
  id: string;
  version: number;
  title: string;
  effective_date: string;
  content_html: string;
}

interface Agreement {
  id: string;
  status: string;
  provider_signed_at: string | null;
  provider_typed_name: string | null;
  countersigned_at: string | null;
  countersigner_name_snapshot: string | null;
  decline_reason: string | null;
  correction_request_reason: string | null;
  agreement_version: number;
}

const STATUS_STYLES: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700 border-gray-200",
  provider_signed_pending_company_countersign: "bg-amber-50 text-amber-700 border-amber-200",
  correction_requested: "bg-orange-50 text-orange-700 border-orange-200",
  declined: "bg-red-50 text-red-700 border-red-200",
  fully_executed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  legacy_approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  provider_signed_pending_company_countersign: "Awaiting Vending Connector countersignature",
  correction_requested: "Correction requested — please re-sign",
  declined: "Declined by Vending Connector",
  fully_executed: "Fully executed",
  legacy_approved: "Legacy approved by admin",
};

export default function PlacementAgreementPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<Template | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [typedName, setTypedName] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [consentEsign, setConsentEsign] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/placement/agreement", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setTemplate(data.template);
      setAgreement(data.agreement);
      if (data.agreement?.provider_typed_name) setTypedName(data.agreement.provider_typed_name);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to load agreement");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/placement/agreement"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const canSign =
    !!agreement &&
    (agreement.status === "not_started" || agreement.status === "draft" || agreement.status === "correction_requested");
  const alreadyExecuted = !!agreement && (agreement.status === "fully_executed" || agreement.status === "legacy_approved");
  const pendingCountersign = agreement?.status === "provider_signed_pending_company_countersign";

  async function submit() {
    if (!token) return;
    if (!typedName.trim()) { setError("Type your legal name"); return; }
    if (!acknowledge) { setError("Please acknowledge you have reviewed the agreement"); return; }
    if (!consentEsign) { setError("Please consent to electronic signature"); return; }

    setSaving(true);
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/placement/agreement/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ typed_name: typedName.trim(), consent_esign: consentEsign }),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Failed to submit signature");
      return;
    }
    setSuccess("Signature submitted — Vending Connector will countersign shortly.");
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/placement" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Placement Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileSignature className="h-6 w-6 text-green-primary" /> Placement Provider Agreement
        </h1>
        <p className="text-sm text-gray-500 mt-1">Review, sign, and view the status of your Vending Connector Placement Provider Agreement.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>
      ) : !template || !agreement ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load the agreement. Contact support.
        </div>
      ) : (
        <>
          {/* Status pill */}
          <div className={`mb-4 rounded-2xl border p-4 flex items-start gap-3 ${STATUS_STYLES[agreement.status] || STATUS_STYLES.not_started}`}>
            {agreement.status === "fully_executed" || agreement.status === "legacy_approved" ? (
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
            ) : agreement.status === "declined" ? (
              <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
            ) : (
              <Clock className="h-5 w-5 mt-0.5 shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold">{STATUS_LABEL[agreement.status] || agreement.status}</p>
              {agreement.provider_signed_at && (
                <p className="text-xs mt-0.5">Signed by you on {new Date(agreement.provider_signed_at).toLocaleString()}{agreement.provider_typed_name ? ` as ${agreement.provider_typed_name}` : ""}.</p>
              )}
              {agreement.countersigned_at && (
                <p className="text-xs mt-0.5">Countersigned by Vending Connector on {new Date(agreement.countersigned_at).toLocaleString()}{agreement.countersigner_name_snapshot ? ` — ${agreement.countersigner_name_snapshot}` : ""}.</p>
              )}
              {agreement.decline_reason && <p className="text-xs mt-0.5 italic">Reason: {agreement.decline_reason}</p>}
              {agreement.correction_request_reason && <p className="text-xs mt-0.5 italic">Correction: {agreement.correction_request_reason}</p>}
            </div>
          </div>

          {success && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 mt-0.5" /><span>{success}</span>
            </div>
          )}
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5" /><span>{error}</span>
            </div>
          )}

          {/* Agreement body */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 mb-4">
            <div className="text-xs text-gray-500 mb-3">
              <strong className="text-gray-700">{template.title}</strong> · v{template.version} · effective {template.effective_date}
            </div>
            <div
              className="max-h-96 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: template.content_html }}
            />
          </div>

          {/* Sign form */}
          {canSign ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Sign Agreement</h2>
              <div className="space-y-2 mb-4">
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-green-primary" />
                  <span>I have reviewed and agree to the Placement Provider Agreement.</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={consentEsign} onChange={(e) => setConsentEsign(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-green-primary" />
                  <span>I consent to conduct this transaction electronically. My typed name below is my electronic signature.</span>
                </label>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Type your full legal name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none"
                  placeholder="Your legal name"
                />
              </div>
              <button
                onClick={submit}
                disabled={saving || !acknowledge || !consentEsign || !typedName.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-5 py-2.5 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                Sign Agreement
              </button>
            </div>
          ) : pendingCountersign ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-500">
              You&apos;ve signed the agreement. Vending Connector will countersign shortly — you&apos;ll receive a copy of the fully executed document by email.
            </div>
          ) : alreadyExecuted ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-500">
              Your agreement is fully executed. A copy was emailed to you at signing.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
