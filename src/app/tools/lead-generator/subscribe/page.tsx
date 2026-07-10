"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Zap, CheckCircle2, AlertCircle, CreditCard, ExternalLink } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface AccessBody {
  canAccessLeadGenerator: boolean;
  requiresSubscription: boolean;
  hasActiveSubscription: boolean;
  shouldShowPaymentGate: boolean;
  isPlacementProvider: boolean;
  reason: string;
  subscription: {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
}

export default function LeadGeneratorSubscribePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [access, setAccess] = useState<AccessBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceLink, setInvoiceLink] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/tools/lead-generator/subscribe"); return; }
      setToken(session.access_token);
      const res = await fetch("/api/tools/lead-generator/access", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const body = (await res.json()) as AccessBody;
        setAccess(body);
        // If they already have access, no gate needed — send them to the tool.
        if (body.canAccessLeadGenerator) {
          router.replace("/tools/lead-generator");
          return;
        }
      }
      setLoading(false);
    });
  }, [router]);

  async function handleSubscribe() {
    setError(null);
    setSubscribing(true);
    try {
      const res = await fetch("/api/tools/lead-generator/subscribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not start subscription");
        return;
      }
      setInvoiceLink(body.invoice_link || null);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubscribing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-green-100">
              <Zap className="w-6 h-6 text-green-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Lead Generator Access</h1>
              <p className="text-sm text-gray-500">Operators — subscribe to unlock</p>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 p-5">
            <p className="text-3xl font-bold text-emerald-800">$9.99<span className="text-base font-medium text-emerald-700">/month</span></p>
            <p className="text-sm text-emerald-800 mt-2">
              Operators can unlock the Lead Generator for $9.99/month. Use it to search,
              organize, and identify potential vending placement opportunities.
            </p>
          </div>

          <ul className="mb-6 space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              Auto-build call lists from Google Places by city + industry
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              Results ship to Google Sheets for your team
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              Up to 60 leads per generation
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              Cancel anytime — access ends immediately
            </li>
          </ul>

          {access?.subscription?.status === "past_due" && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Your last invoice went unpaid. Pay the new invoice below to restore access.
            </div>
          )}
          {access?.subscription?.status === "canceled" && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              Previous subscription canceled. Starting a new subscription creates a fresh invoice.
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {invoiceLink ? (
            <>
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Invoice created. Pay to activate access — you&apos;ll also receive a copy by email.</span>
              </div>
              <a
                href={invoiceLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-6 py-3 text-sm font-semibold text-white cursor-pointer"
              >
                <ExternalLink className="h-4 w-4" /> Pay $9.99 Invoice
              </a>
            </>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-6 py-3 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
            >
              {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Start Monthly Subscription — $9.99/month
            </button>
          )}

          <p className="mt-4 text-[11px] text-gray-500 text-center">
            Subscription renews monthly. Cancel anytime from your account.
            Access begins after payment is confirmed.
          </p>
        </div>
      </div>
    </div>
  );
}
