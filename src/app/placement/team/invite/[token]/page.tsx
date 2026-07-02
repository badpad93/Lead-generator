"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, XCircle, Users, AlertCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface InvitePreview {
  email: string;
  role: string;
  company_name: string;
}

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const res = await fetch(`/api/marketplace/team/invite/${token}`);
      if (res.ok) setInvite(await res.json());
      else {
        const body = await res.json().catch(() => ({}));
        setPreviewError(body.error || "Invite not found");
      }

      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      setAccessToken(session?.access_token || null);

      setLoading(false);
    }
    init();
  }, [token]);

  async function accept() {
    if (!accessToken) {
      router.push(`/login?redirect=/placement/team/invite/${token}`);
      return;
    }
    setError(null);
    setAccepting(true);
    const res = await fetch(`/api/marketplace/team/invite/${token}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Failed to accept");
    else setAccepted(true);
    setAccepting(false);
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
      </div>
    );
  }

  if (previewError) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <XCircle className="h-7 w-7 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Invite unavailable</h1>
        <p className="text-sm text-gray-500 mb-6">{previewError}</p>
        <Link
          href="/placement"
          className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">You&apos;re in!</h1>
        <p className="text-sm text-gray-500 mb-6">Welcome to {invite?.company_name}. Let&apos;s find your first placement.</p>
        <Link
          href="/placement"
          className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-3 text-sm font-semibold text-white cursor-pointer"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
          <Users className="h-7 w-7 text-green-primary" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Join {invite?.company_name}</h1>
        <p className="text-sm text-gray-500 mb-6">
          You&apos;ve been invited to join as a <span className="font-semibold capitalize">{invite?.role}</span>.
          {invite?.email && (
            <>
              <br />
              <span className="text-xs text-gray-400">Invite for {invite.email}</span>
            </>
          )}
        </p>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 text-left">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {accessToken ? (
          <button
            onClick={accept}
            disabled={accepting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-3 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          >
            {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Accept Invite
          </button>
        ) : (
          <Link
            href={`/login?redirect=/placement/team/invite/${token}`}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-3 text-sm font-semibold text-white cursor-pointer"
          >
            Sign in to accept
          </Link>
        )}
        <p className="text-[11px] text-gray-400 mt-3">
          Sign in with the account for {invite?.email} to accept.
        </p>
      </div>
    </div>
  );
}
