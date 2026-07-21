"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, CheckCircle2, AlertCircle, Coffee, ShieldCheck } from "lucide-react";
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
  metadata: Record<string, unknown> | null;
}

interface Prefill {
  full_name: string;
  email: string;
  business_name: string;
  contact_name: string;
  customer_address: string;
}

export default function CoffeeAgreementPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);

  // Form
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [numMachines, setNumMachines] = useState<string>("1");
  const [authRepName, setAuthRepName] = useState("");
  const [authRepTitle, setAuthRepTitle] = useState("");
  const [ackSupply, setAckSupply] = useState(false);
  const [ackMin, setAckMin] = useState(false);
  const [ackInstall, setAckInstall] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [consent, setConsent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { router.push("/login?redirect=/coffee/agreement"); return; }
      setToken(session.access_token);
      const res = await fetch("/api/coffee/agreement", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || "Failed to load agreement");
        return;
      }
      const data = await res.json();
      setTemplate(data.template);
      setAgreement(data.agreement);
      const prefill: Prefill = data.prefill || {};
      const meta = (data.agreement?.metadata || {}) as Record<string, unknown>;
      setCustomerName(String(meta.customer_name || prefill.business_name || ""));
      setCustomerAddress(String(meta.customer_address || prefill.customer_address || ""));
      setNumMachines(String(meta.num_machines || 1));
      setAuthRepName(String(meta.authorized_representative_name || prefill.contact_name || prefill.full_name || ""));
      setAuthRepTitle(String(meta.authorized_representative_title || ""));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function submitSign() {
    setError(null);
    if (!ackSupply || !ackMin || !ackInstall) {
      setError("You must acknowledge all three requirements.");
      return;
    }
    if (!typedName.trim()) { setError("Type your full legal name."); return; }
    if (!consent) { setError("You must consent to conducting business electronically."); return; }
    setSaving(true);
    const res = await fetch("/api/coffee/agreement/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        typed_name: typedName.trim(),
        consent_esign: true,
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim(),
        num_machines: Number(numMachines) || 1,
        authorized_representative_name: authRepName.trim(),
        authorized_representative_title: authRepTitle.trim(),
        ack_exclusive_supply: ackSupply,
        ack_minimum_purchase: ackMin,
        ack_installation_maintenance: ackInstall,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Failed to sign");
      return;
    }
    await load();
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const status = agreement?.status;
  // Only fully_executed hides the form — legacy_approved users are
  // grandfathered so they can order, but they landed here on purpose to
  // sign the real current version. Show them the form.
  const alreadyExecuted = status === "fully_executed";
  const isLegacy = status === "legacy_approved";
  const pendingCountersign = status === "provider_signed_pending_company_countersign";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/coffee" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Coffee Shop
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-xl bg-emerald-100 p-2">
          <Coffee className="h-5 w-5 text-emerald-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{template?.title || "Coffee Supply Agreement"}</h1>
          <p className="text-sm text-gray-500">Version {template?.version} · Effective {template?.effective_date}</p>
        </div>
      </div>

      {status === "legacy_approved" && (
        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900 mb-1 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Grandfathered
          </p>
          <p className="text-sm text-blue-800">
            You&apos;re able to order today under the old application-form acknowledgment.
            Please sign the current version below at your convenience so we have a full
            signed record on file.
          </p>
        </div>
      )}

      {alreadyExecuted && status === "fully_executed" && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900 mb-1 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Fully executed
          </p>
          <p className="text-sm text-emerald-800">
            Signed by you and countersigned by Apex AI Vending. You&apos;re good to order.
          </p>
        </div>
      )}

      {pendingCountersign && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900 mb-1 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Awaiting countersignature
          </p>
          <p className="text-sm text-amber-800">
            You signed on {agreement?.provider_signed_at ? new Date(agreement.provider_signed_at).toLocaleString() : "recently"}.
            Apex AI Vending will countersign shortly — you&apos;ll be able to place orders once that clears.
          </p>
        </div>
      )}

      {/* Agreement content */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-6 max-h-[500px] overflow-y-auto">
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: template?.content_html || "" }} />
      </div>

      {/* Sign form — hidden if already executed */}
      {!alreadyExecuted && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Signature block</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer name (business)</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={pendingCountersign}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Number of machines</label>
              <input
                type="number"
                min={1}
                value={numMachines}
                onChange={(e) => setNumMachines(e.target.value)}
                disabled={pendingCountersign}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Customer address</label>
            <input
              type="text"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Street, City, State ZIP"
              disabled={pendingCountersign}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Authorized representative</label>
              <input
                type="text"
                value={authRepName}
                onChange={(e) => setAuthRepName(e.target.value)}
                disabled={pendingCountersign}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={authRepTitle}
                onChange={(e) => setAuthRepTitle(e.target.value)}
                placeholder="Owner, Director, Manager…"
                disabled={pendingCountersign}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Acknowledgments</p>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={ackSupply}
                onChange={(e) => setAckSupply(e.target.checked)}
                disabled={pendingCountersign}
                className="mt-0.5"
              />
              <span>I agree to the <strong>exclusive supply requirement</strong> — beverage products for the Equipment come from Apex AI Vending only.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={ackMin}
                onChange={(e) => setAckMin(e.target.checked)}
                disabled={pendingCountersign}
                className="mt-0.5"
              />
              <span>I acknowledge the <strong>minimum purchase requirement</strong> of $200/machine/month in beverage supplies.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={ackInstall}
                onChange={(e) => setAckInstall(e.target.checked)}
                disabled={pendingCountersign}
                className="mt-0.5"
              />
              <span>I acknowledge <strong>installation, service, and day-to-day upkeep</strong> responsibilities as set out in section 8.</span>
            </label>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type your full legal name to sign</label>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                disabled={pendingCountersign}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-serif italic"
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={pendingCountersign}
                className="mt-0.5"
              />
              <span>
                I consent to conducting this transaction electronically. My typed name above is a valid electronic
                signature under the E-SIGN Act and applicable state law.
              </span>
            </label>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={submitSign}
            disabled={saving || pendingCountersign}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-6 py-3 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {pendingCountersign ? "Signed — waiting on countersign" : "Sign Agreement"}
          </button>
        </div>
      )}
    </div>
  );
}
