"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { consumeSignupRole } from "@/lib/auth";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      const supabase = createBrowserClient();

      // The @supabase/ssr browser client has detectSessionInUrl: true and
      // flowType: "pkce" built in. It automatically exchanges the ?code=
      // param and writes the session to document.cookie.
      // We listen for the SIGNED_IN event to know when it's done.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (cancelled) return;
          if (event === "SIGNED_IN" && session) {
            subscription.unsubscribe();

            // Check if a signup role was stored (new user from /signup)
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

            // Full-page navigation so the browser sends freshly-set
            // auth cookies with the request (middleware can read them).
            window.location.href = "/dashboard";
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
  }, []);

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
