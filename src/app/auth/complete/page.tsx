"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { consumeSignupRole, consumeRedirectAfterLogin } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabase";

/**
 * /auth/complete
 *
 * Lightweight client page that runs after the server-side callback
 * handler (/auth/callback/route.ts) has already exchanged the OAuth
 * code and set session cookies.
 *
 * This page handles two things that require client-side access:
 *   1. Signup-role assignment  — reads the role stashed in
 *      localStorage before the OAuth redirect and PATCHes the profile.
 *   2. Stored redirect path — reads the pre-login destination from
 *      localStorage and navigates there (default: /dashboard).
 */

function CompleteContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const flow = searchParams.get("flow") || "login";
      const isSignup = flow === "signup";

      if (isSignup) {
        const signupRole = consumeSignupRole();
        if (signupRole) {
          try {
            const supabase = createBrowserClient();
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (session?.access_token) {
              await fetch("/api/auth/me", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ role: signupRole }),
              });
            }
          } catch {
            // Profile might not exist yet — ignore
          }
        }
      } else {
        // Clean up any stale signup role from prior flows
        consumeSignupRole();
      }

      if (cancelled) return;

      const redirectTo = consumeRedirectAfterLogin() || "/dashboard";
      window.location.href = redirectTo;
    }

    finish().catch((err) => {
      if (!cancelled) {
        setError(err?.message || "Something went wrong. Redirecting...");
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 1500);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 mb-2">{error}</p>
          <p className="text-black-primary/50 text-sm">
            Redirecting to dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-primary mx-auto mb-4" />
        <p className="text-black-primary font-medium">Signing you in...</p>
        <p className="text-black-primary/50 text-sm mt-1">
          Please wait while we complete authentication.
        </p>
      </div>
    </div>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-green-primary mx-auto mb-4" />
            <p className="text-black-primary font-medium">Signing you in...</p>
          </div>
        </div>
      }
    >
      <CompleteContent />
    </Suspense>
  );
}
