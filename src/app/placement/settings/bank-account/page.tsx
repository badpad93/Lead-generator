"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

/**
 * Placement Provider bank-account setup page.
 *
 * Two paths:
 *   - No linked account yet → renders a "Link Bank Account" button
 *     that loads the Plaid Link Web SDK from CDN and drives Plaid
 *     Link with a token we fetch from /api/placement/dwolla/link-token.
 *   - Already linked → shows verified status and offers a re-link
 *     button in case they need to switch banks.
 *
 * On Plaid success we POST { public_token, account_id, institution_name }
 * to /api/placement/dwolla/exchange, which does the full Plaid →
 * Dwolla dance server-side.
 */

const PLAID_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

interface Status {
  has_customer: boolean;
  has_funding_source: boolean;
  verification_status: string;
  verified_at: string | null;
}

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (
          publicToken: string,
          metadata: {
            institution?: { name?: string };
            accounts?: Array<{ id: string; name?: string }>;
          },
        ) => void;
        onExit?: (err: unknown) => void;
      }) => { open: () => void };
    };
  }
}

async function bearer(): Promise<string | null> {
  const supabase = createBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function loadPlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.Plaid) return resolve();
    const existing = document.getElementById("plaid-link-sdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Plaid script failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.id = "plaid-link-sdk";
    script.src = PLAID_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid script failed to load"));
    document.body.appendChild(script);
  });
}

export default function BankAccountPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await bearer();
    if (!token) return;
    const res = await fetch("/api/placement/dwolla/status", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  async function handleLink() {
    setError(null);
    setSaved(false);
    setLinking(true);
    try {
      await loadPlaidScript();
      const token = await bearer();
      if (!token) throw new Error("Not signed in");
      const linkRes = await fetch("/api/placement/dwolla/link-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok) throw new Error(linkData.error || "Failed to create Plaid link token");
      if (!window.Plaid) throw new Error("Plaid SDK unavailable");

      const handler = window.Plaid.create({
        token: linkData.link_token,
        onSuccess: async (publicToken, metadata) => {
          setSaving(true);
          try {
            const accountId = metadata.accounts?.[0]?.id;
            if (!accountId) throw new Error("Plaid returned no account");
            const bearerTok = await bearer();
            const exchangeRes = await fetch("/api/placement/dwolla/exchange", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${bearerTok ?? ""}`,
              },
              body: JSON.stringify({
                public_token: publicToken,
                account_id: accountId,
                institution_name: metadata.institution?.name,
              }),
            });
            const data = await exchangeRes.json();
            if (!exchangeRes.ok) {
              setError(data.error || "Failed to complete bank verification");
            } else {
              setSaved(true);
              await refresh();
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Unexpected error");
          }
          setSaving(false);
          setLinking(false);
        },
        onExit: () => setLinking(false),
      });
      handler.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setLinking(false);
    }
  }

  const verified = status?.has_funding_source && status.verification_status === "verified";

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/placement/settings"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-600 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Bank Account for Payouts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Link your bank account to receive automatic ACH payouts the moment an operator&apos;s balance clears. Verification happens through Plaid — we never see your account numbers.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-green-600" />
              <h2 className="text-sm font-semibold text-gray-900">Bank verification</h2>
            </div>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : verified ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                  <ShieldCheck className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Bank linked and verified</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Verified {status.verified_at ? new Date(status.verified_at).toLocaleDateString() : "just now"}. Payouts will land in this account within 1–3 business days after each accepted location&apos;s operator balance clears.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLink}
                  disabled={linking || saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {linking || saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Working…
                    </>
                  ) : (
                    "Switch Bank Account"
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-700">
                  You haven&apos;t linked a bank yet. Until you do, payouts fall back to our manual QuickBooks Bill queue — slower and requires admin action to release.
                </p>
                <button
                  type="button"
                  onClick={handleLink}
                  disabled={linking || saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {linking || saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {saving ? "Verifying…" : "Opening Plaid…"}
                    </>
                  ) : (
                    <>
                      <Landmark className="h-4 w-4" />
                      Link Bank Account
                    </>
                  )}
                </button>
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {saved && (
              <div className="mt-4 flex items-start gap-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Bank verified. You&apos;ll receive automatic payouts going forward.</span>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-[11px] text-gray-400">
          Verification is powered by Plaid; money movement is powered by Dwolla. Vending Connector never stores or transmits your bank credentials.
        </p>
      </div>
    </div>
  );
}
