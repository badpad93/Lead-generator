"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Zap, ArrowLeft, ShieldCheck, Building2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import LeadGeneratorForm from "@/app/components/LeadGeneratorForm";

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

/**
 * Customer-facing Lead Generator shell.
 *
 * Serves two audiences from the same URL — Placement Providers (free)
 * and paid operators. Explicitly NOT part of the CRM shell — no CRM
 * sidebar, no admin links, just the tool + a home link.
 *
 * Access is verified server-side twice:
 *   1) On page load via GET /api/tools/lead-generator/access
 *   2) On generate-attempt via POST /api/sales/lead-generator (which
 *      is the shared API — same guard applies to both shells).
 *
 * If a paid operator/location_manager/requestor lands here without an
 * active subscription, we bounce them to /tools/lead-generator/subscribe.
 * If the account isn't eligible at all, we bounce home with a message.
 */
export default function ToolsLeadGeneratorPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<AccessBody | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/tools/lead-generator"); return; }
      setToken(session.access_token);
      const res = await fetch("/api/tools/lead-generator/access", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        router.push("/");
        return;
      }
      const body = (await res.json()) as AccessBody;
      setAccess(body);
      if (!body.canAccessLeadGenerator) {
        if (body.shouldShowPaymentGate) {
          router.replace("/tools/lead-generator/subscribe");
        } else {
          router.replace("/");
        }
        return;
      }
      setLoading(false);
    });
  }, [router]);

  if (loading || !access) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
      </div>
    );
  }

  const homeHref = access.isPlacementProvider ? "/placement" : "/";
  const homeLabel = access.isPlacementProvider ? "Placement Dashboard" : "Home";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link href={homeHref} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to {homeLabel}
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-green-100">
            <Zap className="w-5 h-5 text-green-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lead Generator</h1>
            <p className="text-sm text-gray-500">
              Auto-build outbound call lists from Google Places. Results ship to Google Sheets.
            </p>
          </div>
        </div>

        {access.isPlacementProvider && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-900">
              You&apos;re on Placement Provider access — Lead Generator is included in your account.
            </div>
          </div>
        )}

        {access.requiresSubscription && access.hasActiveSubscription && (
          <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
            <Building2 className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold">Active subscription — $9.99/month</p>
              {access.subscription?.current_period_end && (
                <p className="text-xs mt-0.5">
                  Next renewal: {new Date(access.subscription.current_period_end).toLocaleDateString()}
                  {access.subscription.cancel_at_period_end ? " · cancellation scheduled" : ""}
                </p>
              )}
              <Link
                href="/tools/lead-generator/manage"
                className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:text-blue-800 underline"
              >
                Manage subscription →
              </Link>
            </div>
          </div>
        )}

        <LeadGeneratorForm token={token} />
      </div>
    </div>
  );
}
