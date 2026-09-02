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
  // Two-state guardrail:
  //   otherTenantSlug — this account is already permanently enrolled
  //     with a DIFFERENT tenant. Show explicit Accept confirm
  //     (never silently re-point). Value is the slug of the OTHER
  //     tenant so the copy can be clear about what would change.
  //   autoConsumeAttempted — de-dupes the auto-consume attempt
  //     across React strict-mode double-invoke and any accidental
  //     re-render.
  const [otherTenantSlug, setOtherTenantSlug] = useState<string | null>(null);
  const [autoConsumeAttempted, setAutoConsumeAttempted] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Fetch invitation preview + current session profile in
        // parallel so the auto-consume matrix can decide with all
        // three inputs (preview state, session, existing enrollment).
        const supabase = createBrowserClient();
        const [previewRes, sessionRes] = await Promise.all([
          fetch(`/api/storefront/enrollment/preview?token=${token}`),
          supabase.auth.getSession(),
        ]);
        if (!previewRes.ok) {
          if (previewRes.status === 404) {
            throw new Error(
              "This invitation isn't currently valid. It may have been used, revoked, expired, or the storefront may not yet be open to enrollment.",
            );
          }
          if (previewRes.status === 503) {
            throw new Error(
              "Enrollment is temporarily unavailable. Please try again in a few minutes.",
            );
          }
          throw new Error(`Preview failed with status ${previewRes.status}`);
        }
        const data = (await previewRes.json()) as PreviewResponse;
        setPreview(data);
        const session = sessionRes.data.session;
        setSessionEmail(session?.user?.email ?? null);

        // Bail out early if the invitation itself is in a bad state
        // — auto-consume is only for happy-path tokens.
        if (
          data.invitation.expired ||
          data.invitation.revoked ||
          data.invitation.already_used
        ) {
          return;
        }

        // Signed out → don't auto-consume. The user must click
        // Accept, which routes them into /signup?invite_token=…
        // (or /login) so the callback can complete the consume
        // after auth lands.
        if (!session) return;

        // Load the caller's current storefront_tenant_id so we can
        // apply the different-tenant guardrail.
        let currentTenantId: string | null = null;
        try {
          const meRes = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (meRes.ok) {
            const profile = (await meRes.json()) as { storefront_tenant_id?: string | null };
            currentTenantId = profile.storefront_tenant_id ?? null;
          }
        } catch {}

        // Case A: already enrolled with THIS tenant → skip consume,
        // land them on the storefront (double-consume attempts are
        // idempotent in the API but the round-trip is wasted).
        if (currentTenantId && currentTenantId === data.tenant.id) {
          router.push(`/coffee/o/${data.tenant.slug}`);
          return;
        }

        // Case B: enrolled with a DIFFERENT tenant → don't silently
        // re-point. Set the guardrail state and let the render show
        // an explicit warning + explicit Accept button.
        if (currentTenantId && currentTenantId !== data.tenant.id) {
          try {
            const otherRes = await fetch(`/api/storefront/public/${currentTenantId}`);
            // /public/[slug] takes a slug, not an id, so this may
            // 404 — that's fine, we just show a generic warning
            // without naming the other tenant.
            if (otherRes.ok) {
              const other = (await otherRes.json()) as { tenant?: { slug: string } };
              if (other.tenant?.slug) setOtherTenantSlug(other.tenant.slug);
              else setOtherTenantSlug("");
            } else {
              setOtherTenantSlug("");
            }
          } catch {
            setOtherTenantSlug("");
          }
          return;
        }

        // Case C: signed in, not enrolled anywhere, token healthy
        // → auto-consume + redirect.
        if (!autoConsumeAttempted) {
          setAutoConsumeAttempted(true);
          await consume();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load invitation");
      } finally {
        setLoading(false);
      }
    })();
    // Intentionally not depending on `consume` or `autoConsumeAttempted`
    // — this effect runs once per token; further consume attempts
    // are user-triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Route signed-out users through signup, not login, and
        // stash the invite_token so the auth callback consumes it
        // automatically after account creation completes. This is
        // Option B — brand-new customers land on the storefront
        // without ever seeing this page again.
        const { storeInviteToken } = await import("@/lib/auth");
        storeInviteToken(token);
        const next = `/coffee/invite/${token}`;
        router.push(
          `/signup?invite_token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(next)}`,
        );
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

  if (loading || consuming) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {consuming ? "Setting up your account…" : "Loading…"}
      </div>
    );
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
          {otherTenantSlug !== null ? (
            // Guardrail: signed-in user is already permanently linked
            // to a different tenant. Auto-consume is suppressed;
            // explicit confirm is required because accepting here
            // will refuse server-side (PROFILE_LINKED_TO_OTHER_TENANT)
            // and the user needs to understand why the click didn't
            // silently switch them.
            <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold">This account is already enrolled with a different storefront.</div>
              <div className="mt-1">
                Your Vending Connector account is permanently linked to{" "}
                {otherTenantSlug ? (
                  <code>{otherTenantSlug}</code>
                ) : (
                  "another operator"
                )}. Only a Vending Connector administrator can transfer
                it. Contact support if you meant to switch storefronts —
                clicking Accept below will be refused with the same
                message.
              </div>
            </div>
          ) : null}
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
