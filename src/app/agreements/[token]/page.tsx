"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2, CheckCircle2, FileText, Shield, CreditCard, PenTool } from "lucide-react";

interface Agreement {
  id: string;
  token: string;
  recipient_name: string;
  recipient_email: string;
  industry: string;
  zip: string;
  pricing_score: number;
  pricing_tier: number;
  pricing_price: number;
  status: string;
  signature_name: string | null;
  signed_at: string | null;
  paid_at: string | null;
  pdf_url: string | null;
  created_at: string;
  sales_accounts: { business_name: string } | null;
}

const TIER_LABELS: Record<number, string> = { 1: "Tier 1", 2: "Tier 2", 3: "Tier 3", 4: "Tier 4", 5: "Tier 5" };

function AgreementContent() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const justPaid = searchParams.get("paid") === "true";

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/agreements/token/${token}`);
      if (res.ok) {
        setAgreement(await res.json());
      } else {
        setError("Agreement not found or has expired.");
      }
      setLoading(false);
    }
    load();
  }, [token]);

  async function handleSign() {
    if (!signatureName.trim() || signatureName.trim().length < 2) {
      setSignError("Please type your full name");
      return;
    }
    setSigning(true);
    setSignError(null);
    const res = await fetch(`/api/agreements/token/${token}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature_name: signatureName }),
    });
    if (res.ok) {
      setAgreement((a) => a ? { ...a, status: "signed", signature_name: signatureName, signed_at: new Date().toISOString() } : a);
    } else {
      const data = await res.json().catch(() => ({}));
      setSignError(data.error || "Failed to sign");
    }
    setSigning(false);
  }

  async function handlePay() {
    setPaying(true);
    const res = await fetch(`/api/agreements/token/${token}/checkout`, { method: "POST" });
    if (res.ok) {
      const { url } = await res.json();
      window.location.href = url;
    } else {
      const data = await res.json().catch(() => ({}));
      setSignError(data.error || "Failed to create payment session");
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (error || !agreement) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Agreement Not Found</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const isPaid = agreement.status === "paid" || justPaid;
  const isSigned = agreement.status === "signed" || agreement.status === "paid" || isPaid;
  const price = Number(agreement.pricing_price);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-green-600 mb-1">Vending Connector</h1>
          <p className="text-sm text-gray-500">Location Placement Agreement</p>
        </div>

        {/* Status Banner */}
        {isPaid && (
          <div className="mb-6 rounded-xl bg-green-50 border border-green-200 p-4 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-600 mb-2" />
            <p className="font-semibold text-green-800">Payment Complete</p>
            <p className="text-sm text-green-600 mt-1">Full site details have been sent to {agreement.recipient_email}</p>
          </div>
        )}

        {/* Agreement Card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Prepared For */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Prepared For</p>
            <p className="text-lg font-bold text-gray-900">{agreement.sales_accounts?.business_name || agreement.recipient_name}</p>
            <p className="text-sm text-gray-500">{agreement.recipient_name} — {agreement.recipient_email}</p>
          </div>

          {/* Location Summary */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Location Summary</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400">Industry</p>
                <p className="text-sm font-semibold text-gray-900">{agreement.industry || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Zip Code</p>
                <p className="text-sm font-semibold text-gray-900">{agreement.zip || "—"}</p>
              </div>
            </div>
          </div>

          {/* Scoring */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Placement Score</p>
            <div className="flex items-center justify-between mb-3">
              <span className="text-3xl font-bold text-gray-900">{agreement.pricing_score}</span>
              <span className="text-sm text-gray-500">/ 100</span>
              <span className="ml-auto rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                {TIER_LABELS[agreement.pricing_tier] || `Tier ${agreement.pricing_tier}`}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-green-500 transition-all"
                style={{ width: `${Math.min(agreement.pricing_score, 100)}%` }}
              />
            </div>
          </div>

          {/* Price */}
          <div className="px-6 py-6 border-b border-gray-100 bg-gray-50/50">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Placement Fee</p>
            <p className="text-4xl font-bold text-green-600">${price.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-1">One-time location placement fee</p>
          </div>

          {/* Terms */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Terms</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                This fee covers the exclusive placement of vending machines at the specified location.
              </li>
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                Full site details (address, decision maker contact, etc.) will be provided after payment.
              </li>
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                Placement is subject to final verification of site details.
              </li>
            </ul>
          </div>

          {/* Signature Section */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              <PenTool className="inline h-3.5 w-3.5 mr-1" />
              Signature
            </p>
            {isSigned ? (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">Signed</span>
                </div>
                <p className="text-lg italic text-gray-700 font-serif">{agreement.signature_name}</p>
                {agreement.signed_at && (
                  <p className="text-xs text-gray-400 mt-1">{new Date(agreement.signed_at).toLocaleString()}</p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  By typing your name below, you agree to the terms of this Location Placement Agreement.
                </p>
                <input
                  type="text"
                  placeholder="Type your full name to sign"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg font-serif italic text-gray-700 placeholder:text-gray-300 placeholder:not-italic focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                {signError && <p className="mt-2 text-sm text-red-600">{signError}</p>}
                <button
                  onClick={handleSign}
                  disabled={signing || !signatureName.trim()}
                  className="mt-3 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {signing ? (
                    <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Signing...</span>
                  ) : (
                    <span className="flex items-center justify-center gap-2"><PenTool className="h-4 w-4" /> Sign Agreement</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Payment Section */}
          <div className="px-6 py-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              <CreditCard className="inline h-3.5 w-3.5 mr-1" />
              Payment
            </p>
            {isPaid ? (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">Payment Complete — ${price.toLocaleString()}</span>
                </div>
                {agreement.paid_at && (
                  <p className="text-xs text-gray-400 mt-1">{new Date(agreement.paid_at).toLocaleString()}</p>
                )}
              </div>
            ) : isSigned ? (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  Your agreement has been signed. Complete payment to receive the full site details.
                </p>
                <button
                  onClick={handlePay}
                  disabled={paying}
                  className="w-full rounded-lg bg-green-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {paying ? (
                    <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Redirecting to payment...</span>
                  ) : (
                    <span className="flex items-center justify-center gap-2"><CreditCard className="h-4 w-4" /> Pay ${price.toLocaleString()}</span>
                  )}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Please sign the agreement above before proceeding to payment.</p>
            )}
          </div>
        </div>

        {/* PDF Download */}
        {agreement.pdf_url && (
          <div className="mt-4 text-center">
            <a
              href={agreement.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
              Download PDF
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">Vending Connector — vendingconnector.com</p>
        </div>
      </div>
    </div>
  );
}

export default function AgreementPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    }>
      <AgreementContent />
    </Suspense>
  );
}
