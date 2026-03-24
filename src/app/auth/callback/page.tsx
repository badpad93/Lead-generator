"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { consumeSignupRole, consumeRedirectAfterLogin, consumeAuthFlow } from "@/lib/auth";

function CallbackContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      const supabase = createBrowserClient();

      // Determine the flow from URL param (primary) or localStorage fallback.
      // The URL param is set in the OAuth redirectTo, and localStorage is set
      // before the OAuth redirect as a belt-and-suspenders approach.
      const flowParam = searchParams.get("flow");
      const storedFlow = consumeAuthFlow();
      const flow = flowParam || storedFlow || "login";
      const isSignup = flow === "signup";

      // The @supabase/ssr browser client has detectSessionInUrl: true and
      // flowType: "pkce" built in. It automatically exchanges the ?code=
      // param and writes the session to document.cookie.
      // We listen for the SIGNED_IN event to know when it's done.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (cancelled) return;
          if (event === "SIGNED_IN" && session) {
            subscription.unsubscribe();

            if (isSignup) {
              // SIGNUP FLOW: apply the selected role to the user's profile
              const signupRole = consumeSignupRole();
              if (signupRole) {
                try {
                  await fetch("/api/auth/me", {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ role: signupRole }),
                  });
                } catch {
                  // Profile might not exist yet — ignore
                }
              }

              // Redirect to the stored path or dashboard for signup
              const redirectTo = consumeRedirectAfterLogin() || "/dashboard";
              window.location.href = redirectTo;
            } else {
              // LOGIN FLOW: consume any stale signup role (shouldn't exist, but clean up)
              consumeSignupRole();

              // Redirect to the stored path (e.g. user tried to visit
              // /browse-requests before logging in) or fall back to /dashboard.
              const redirectTo = consumeRedirectAfterLogin() || "/dashboard";
              window.location.href = redirectTo;
            }
          }
        }
      );

      // Safety timeout — if no SIGNED_IN event fires within 10s, fail
      const timer = setTimeout(() => {
        if (cancelled) return;
        subscription.unsubscribe();
        setError("Authentication timed out. Please try again.");
        setTimeout(() => { window.location.href = "/login"; }, 2000);
      }, 10000);

      return () => {
        cancelled = true;
        subscription.unsubscribe();
        clearTimeout(timer);
      };
    }

    handleCallback();
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 mb-2">{error}</p>
          <p className="text-black-primary/50 text-sm">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-primary mx-auto mb-4" />
        <p className="text-black-primary font-medium">Signing you in...</p>
        <p className="text-black-primary/50 text-sm mt-1">Please wait while we complete authentication.</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
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
      <CallbackContent />
    </Suspense>
  );
}
