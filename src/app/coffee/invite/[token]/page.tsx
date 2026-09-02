"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface PreviewResponse {
  invitation: {
    id: string;
    tenant_id: string;
    email: string | null;
    display_name: string | null;
    target_role: string;
    expires_at: string;
    already_used: boolean;
    expired: boolean;
    revoked: boolean;
  };
  tenant: {
    id: string;
    slug: string;
    display_name: string;
    brand: Record<string, unknown>;
    public_page: Record<string, unknown>;
  };
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consuming, setConsuming] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/storefront/enrollment/preview?token=${token}`);
        if (!res.ok) {
          // Map the API response to a human-readable message. 404
          // is deliberately ambiguous server-side (either an
          // invalid token OR the enrollment flag is off) — the copy
          // reflects that ambiguity honestly instead of asserting
          // one or the other. 503 signals "service temporarily
          // unavailable" (currently unreachable from preview but
          // reserved for future gating).
          if (res.status === 404) {
            throw new Error(
              "This invitation isn't currently valid. It may have been used, revoked, expired, or the storefront may not yet be open to enrollment.",
            );
          }
          if (res.status === 503) {
            throw new Error(
              "Enrollment is temporarily unavailable. Please try again in a few minutes.",
            );
          }
          throw new Error(`Preview failed with status ${res.status}`);
        }
        const data = (await res.json()) as PreviewResponse;
        setPreview(data);
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setSessionEmail(session?.user?.email ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load invitation");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function consume() {
    setConsuming(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push(`/login?next=${encodeURIComponent(`/coffee/invite/${token}`)}`);
        return;
      }
      const res = await fetch("/api/storefront/enrollment/consume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Enrollment failed");
      }
      const body = (await res.json()) as { tenantId: string };
      const tenantSlug = preview?.tenant.slug;
      router.push(tenantSlug ? `/coffee/o/${tenantSlug}` : "/coffee");
      void body;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setConsuming(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  }
  if (error || !preview) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-lg font-semibold">Invitation not available</div>
          <div className="mt-2 text-sm text-gray-600">
            {error ?? "This link is no longer valid."}
          </div>
          <Link href="/" className="mt-6 inline-block text-blue-600 underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const brand = preview.tenant.brand ?? {};
  const primary = (brand.primary_color as string) || "#1a1a1a";
  const accent = (brand.accent_color as string) || "#c4a877";
  const text = (brand.text_color as string) || "#f4f0e8";

  if (preview.invitation.expired || preview.invitation.revoked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-lg font-semibold">This invitation has expired</div>
          <div className="mt-2 text-sm text-gray-600">
            Contact {preview.tenant.display_name} for a new link.
          </div>
        </div>
      </div>
    );
  }
  if (preview.invitation.already_used) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-lg font-semibold">This invitation was already used</div>
          <Link
            href={`/coffee/o/${preview.tenant.slug}`}
            className="mt-4 inline-block text-blue-600 underline"
          >
            Visit {preview.tenant.display_name}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#f6f4ef" }}>
      <header className="w-full py-10 px-6" style={{ background: primary, color: text }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-sm opacity-75">You've been invited to</div>
          <div className="text-3xl font-semibold mt-1" style={{ color: accent }}>
            {preview.tenant.display_name}
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-gray-800">
            Continue to enroll your account. Once you accept, this account is
            permanently linked to <strong>{preview.tenant.display_name}</strong>
            . Only a Vending Connector administrator can transfer it later.
          </p>
          {preview.invitation.email ? (
            <div className="mt-4 text-sm text-gray-600">
              Invited email: <strong>{preview.invitation.email}</strong>
              {sessionEmail && sessionEmail.toLowerCase() !== preview.invitation.email.toLowerCase() ? (
                <div className="mt-1 text-amber-700">
                  You are signed in as {sessionEmail}. If this isn't the invited
                  account, sign out and back in with {preview.invitation.email}.
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={consume}
              disabled={consuming}
              className="rounded-md px-5 py-2 text-white font-semibold disabled:opacity-60"
              style={{ background: accent, color: primary }}
            >
              {consuming ? "Enrolling…" : "Accept invitation"}
            </button>
            <Link href="/" className="text-sm text-gray-600 underline">
              Not now
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
