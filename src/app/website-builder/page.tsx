"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Globe, Plus, ArrowRight, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface RequestListItem {
  id: string;
  status: string;
  business_name: string | null;
  updated_at: string;
  submitted_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  needs_information: "Action Required",
  approved_for_build: "Approved for Build",
  in_development: "In Development",
  client_review: "Client Review",
  ready_to_launch: "Ready to Launch",
  launched: "Launched",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-blue-100 text-blue-700",
  needs_information: "bg-amber-100 text-amber-800",
  approved_for_build: "bg-emerald-100 text-emerald-800",
  in_development: "bg-emerald-100 text-emerald-800",
  client_review: "bg-purple-100 text-purple-800",
  ready_to_launch: "bg-purple-100 text-purple-800",
  launched: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

/**
 * Landing for "Get Your Own Vending Website". Lists the caller's own
 * requests + a "start new" CTA. New drafts create through POST and
 * redirect straight into the wizard so the customer sees prefilled
 * fields on step 1.
 */
export default function WebsiteBuilderIndex() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [requests, setRequests] = useState<RequestListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/website-builder"); return; }
      setToken(session.access_token);
      const res = await fetch("/api/website-requests", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const body = await res.json();
        setRequests(body.requests || []);
      }
      setLoading(false);
    });
  }, [router]);

  async function createDraft() {
    setError(null);
    setCreating(true);
    const res = await fetch("/api/website-requests", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setCreating(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not create draft");
      return;
    }
    const body = await res.json();
    router.push(`/website-builder/${body.request.id}`);
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const currentDraft = requests.find((r) => r.status === "draft" || r.status === "needs_information");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
            <Globe className="h-6 w-6 text-green-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Get Your Own Vending Website</h1>
            <p className="text-sm text-gray-500">A guided intake so our team can build your site — takes about 15 minutes.</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {currentDraft ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-white p-5">
            <p className="text-sm font-semibold text-emerald-800 mb-1">
              {currentDraft.status === "needs_information" ? "Action required on your request" : "Continue your draft"}
            </p>
            <p className="text-xs text-gray-500 mb-3">
              {currentDraft.business_name || "Untitled"} · saved {new Date(currentDraft.updated_at).toLocaleString()}
            </p>
            <Link
              href={`/website-builder/${currentDraft.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-5 py-2.5 text-sm font-semibold text-white"
            >
              Resume <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-700 mb-3">
              Ready to start? Our team uses your intake to build a website tailored to your vending
              business — branding, content, features, everything.
            </p>
            <button
              onClick={createDraft}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-5 py-2.5 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Start New Website Request
            </button>
          </div>
        )}

        {requests.length > 0 && (
          <div className="rounded-2xl border border-gray-100 bg-white">
            <div className="p-4 border-b border-gray-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your Requests</p>
            </div>
            <ul className="divide-y divide-gray-50">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/website-builder/${r.id}`}
                    className="flex items-center gap-3 p-4 hover:bg-gray-50/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.business_name || "Untitled request"}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1.5">
                        <Clock className="h-3 w-3" /> Updated {new Date(r.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status] || "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                    {r.status === "launched" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
