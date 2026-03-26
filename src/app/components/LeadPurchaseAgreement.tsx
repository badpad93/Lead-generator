"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  X,
  FileText,
  CheckSquare,
  Loader2,
  AlertCircle,
  PenLine,
} from "lucide-react";
import { AGREEMENT_TEXT, AGREEMENT_VERSION } from "@/lib/agreementText";

interface LeadPurchaseAgreementProps {
  leadId: string;
  leadTitle: string;
  leadPrice: number;
  userEmail: string;
  onSigned: (agreementId: string) => void;
  onCancel: () => void;
}

export default function LeadPurchaseAgreement({
  leadId,
  leadTitle,
  leadPrice,
  userEmail,
  onSigned,
  onCancel,
}: LeadPurchaseAgreementProps) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);
  const [fullName, setFullName] = useState("");
  const [signDate, setSignDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    if (atBottom) setScrolledToBottom(true);
  }, []);

  // Check on mount in case agreement fits without scrolling
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 20) {
      setScrolledToBottom(true);
    }
  }, []);

  const allChecked = check1 && check2 && check3;
  const hasSignature = fullName.trim().length >= 2;
  const canSubmit = scrolledToBottom && allChecked && hasSignature && !signing;

  async function handleSign() {
    if (!canSubmit) return;
    setSigning(true);
    setError(null);

    try {
      const token = await getToken();
      const res = await fetch("/api/agreements/sign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          leadId,
          fullName: fullName.trim(),
          userEmail,
          acceptedTerms: true,
          acceptedPopulationClause: true,
          acceptedEsign: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to sign agreement");
        return;
      }

      onSigned(data.agreementId);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-4">
      <div className="mx-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
              <FileText className="h-5 w-5 text-green-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-black-primary">
                Lead Purchase Agreement
              </h2>
              <p className="text-xs text-gray-400">
                Version {AGREEMENT_VERSION}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Lead Summary */}
        <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-black-primary truncate max-w-[350px]">
                {leadTitle}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Lead ID: {leadId.slice(0, 8).toUpperCase()}
              </p>
            </div>
            <span className="text-lg font-bold text-green-primary">
              ${leadPrice.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Scrollable Agreement Text */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-4 min-h-0"
        >
          <div className="prose prose-sm prose-gray max-w-none">
            {AGREEMENT_TEXT.split("\n").map((line, i) => {
              if (!line.trim()) return <br key={i} />;
              if (
                line.startsWith("Lead Purchase Agreement") ||
                line.startsWith("Company:")
              ) {
                return (
                  <h3
                    key={i}
                    className="text-base font-bold text-black-primary mt-2 mb-1"
                  >
                    {line}
                  </h3>
                );
              }
              if (/^\d+\.\s/.test(line)) {
                return (
                  <h4
                    key={i}
                    className="text-sm font-semibold text-black-primary mt-4 mb-1"
                  >
                    {line}
                  </h4>
                );
              }
              return (
                <p key={i} className="text-sm text-gray-600 leading-relaxed">
                  {line}
                </p>
              );
            })}
          </div>

          {!scrolledToBottom && (
            <div className="sticky bottom-0 flex justify-center py-2">
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                Scroll to bottom to continue
              </span>
            </div>
          )}
        </div>

        {/* Sticky Bottom: Checkboxes + Signature + Submit */}
        <div className="border-t border-gray-100 px-6 py-4 shrink-0 bg-white space-y-4">
          {/* Checkboxes */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={check1}
                onChange={(e) => setCheck1(e.target.checked)}
                disabled={!scrolledToBottom}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-primary focus:ring-green-primary disabled:opacity-40 cursor-pointer"
              />
              <span
                className={`text-sm leading-snug ${
                  scrolledToBottom
                    ? "text-black-primary"
                    : "text-gray-400"
                }`}
              >
                I have read and understand that some leads may take up to 20
                minutes to populate after purchase.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={check2}
                onChange={(e) => setCheck2(e.target.checked)}
                disabled={!scrolledToBottom}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-primary focus:ring-green-primary disabled:opacity-40 cursor-pointer"
              />
              <span
                className={`text-sm leading-snug ${
                  scrolledToBottom
                    ? "text-black-primary"
                    : "text-gray-400"
                }`}
              >
                I agree to the Lead Purchase Agreement.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={check3}
                onChange={(e) => setCheck3(e.target.checked)}
                disabled={!scrolledToBottom}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-primary focus:ring-green-primary disabled:opacity-40 cursor-pointer"
              />
              <span
                className={`text-sm leading-snug ${
                  scrolledToBottom
                    ? "text-black-primary"
                    : "text-gray-400"
                }`}
              >
                I consent to conduct this transaction electronically and to use
                an electronic signature.
              </span>
            </label>
          </div>

          {/* Signature Section */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <PenLine className="h-4 w-4 text-green-primary" />
              <span className="text-sm font-semibold text-black-primary">
                Electronic Signature
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Full Legal Name *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full legal name"
                  disabled={!allChecked}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary disabled:opacity-40 disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={userEmail}
                  readOnly
                  className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={signDate}
                  onChange={(e) => setSignDate(e.target.value)}
                  disabled={!allChecked}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary disabled:opacity-40 disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Typed Signature
                </label>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 min-h-[38px]">
                  {fullName.trim() ? (
                    <span className="italic text-lg text-black-primary font-serif">
                      {fullName.trim()}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-300">
                      Your name appears here
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              By typing your name and clicking Sign & Purchase, you agree to
              this legally binding agreement.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-black-primary hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSign}
              disabled={!canSubmit}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {signing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : (
                <>
                  <CheckSquare className="h-4 w-4" />
                  Sign & Purchase — ${leadPrice.toLocaleString()}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to get auth token
async function getToken(): Promise<string | null> {
  try {
    const { createBrowserClient } = await import("@/lib/supabase");
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}
