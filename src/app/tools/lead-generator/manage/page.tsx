"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Zap, AlertCircle, XCircle, CheckCircle2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface AccessBody {
  canAccessLeadGenerator: boolean;
  requiresSubscription: boolean;
  hasActiveSubscription: boolean;
  subscription: {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
}

export default function LeadGeneratorManagePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [access, setAccess] = useState<AccessBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (t: string) => {
    const res = await fetch("/api/tools/lead-generator/access", {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) setAccess((await res.json()) as AccessBody);
    setLoading(false);
  };

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/tools/lead-generator/manage"); return; }
      setToken(session.access_token);
      load(session.access_token);
    });
  }, [router]);

  async function handleCancel() {
    if (!confirm("Cancel your Lead Generator subscription? Access ends immediately.")) return;
    setError(null); setMessage(null);
    setCanceling(true);
    try {
      const res = await fetch("/api/tools/lead-generator/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || "Cancel failed");
        return;
      }
      setMessage("Subscription canceled. Access has ended.");
      await load(token);
    } catch {
      setError("Network error — please try again");
    } finally {
      setCanceling(false);
    }
  }

  if (loading || !access) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const sub = access.subscription;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link href="/tools/lead-generator" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Lead Generator
        </Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-green-100">
              <Zap className="w-6 h-6 text-green-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Manage Subscription</h1>
              <p className="text-sm text-gray-500">Lead Generator — $9.99/month</p>
            </div>
          </div>

          {message && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5" /> {message}
            </div>
          )}
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5" /> {error}
            </div>
          )}

          <div className="mb-6 rounded-xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Status</p>
            <p className="text-lg font-semibold text-gray-900 capitalize">
              {sub?.status || (access.canAccessLeadGenerator ? "Free access" : "No subscription")}
            </p>
            {sub?.current_period_end && (
              <p className="text-xs text-gray-500 mt-2">
                {sub.status === "active"
                  ? `Renews ${new Date(sub.current_period_end).toLocaleDateString()}`
                  : `Period ended ${new Date(sub.current_period_end).toLocaleDateString()}`}
              </p>
            )}
          </div>

          {sub?.status === "active" && (
            <button
              onClick={handleCancel}
              disabled={canceling}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 hover:bg-red-50 px-6 py-3 text-sm font-semibold text-red-700 cursor-pointer disabled:opacity-50"
            >
              {canceling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Cancel Subscription
            </button>
          )}

          {(!sub || sub.status !== "active") && access.requiresSubscription && (
            <Link
              href="/tools/lead-generator/subscribe"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-6 py-3 text-sm font-semibold text-white cursor-pointer"
            >
              Start Subscription — $9.99/month
            </Link>
          )}

          {access.canAccessLeadGenerator && !access.requiresSubscription && (
            <p className="text-center text-sm text-gray-500">
              Your account has free Lead Generator access — no subscription needed.
            </p>
          )}

          <p className="mt-6 text-[11px] text-gray-500 text-center">
            Canceling ends access immediately. You can restart a subscription anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
