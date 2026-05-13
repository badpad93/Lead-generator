"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { consumeSignupRole, consumeRedirectAfterLogin, consumeAuthFlow, consumeSignupLead } from "@/lib/auth";

function CallbackContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      const supabase = createBrowserClient();

      // Determine the flow from URL param (primary) or localStorage fallback.
      const flowParam = searchParams.get("flow");
      const storedFlow = consumeAuthFlow();
      const flow = flowParam || storedFlow || "login";
      const isSignup = flow === "signup";

      // Obtain the session. The client uses implicit flow (session arrives
      // in the URL hash and is auto-detected by the Supabase client).
      // We also handle the legacy PKCE flow (code in query string) as a
      // fallback in case old links or cached redirects still use it.
      let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null;

      const code = searchParams.get("code");
      if (code) {
        // PKCE fallback: try to exchange the code for a session
        const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (!exchangeErr && data.session) {
          session = data.session;
        }
      }

      if (!session) {
        // Implicit flow: the Supabase client auto-detects the session
        // from the URL hash. Give it a moment to process, then read it.
        if (cancelled) return;
        const { data: { session: detected } } = await supabase.auth.getSession();
        session = detected;
      }

      if (!session) {
        // Last resort: wait briefly for onAuthStateChange to fire
        if (cancelled) return;
        session = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(null), 3000);
          const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
            if (s) {
              clearTimeout(timeout);
              subscription.unsubscribe();
              resolve(s);
            }
          });
        });
      }

      if (cancelled) return;

      if (!session) {
        setError("Failed to complete sign-in. Please try again.");
        setTimeout(() => {
          window.location.href = "/login?error=" + encodeURIComponent("Sign-in failed. Please try again.");
        }, 2000);
        return;
      }

      // Ensure the profile exists (auto-creates for new users via GET)
      try {
        await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch {
        // Best-effort — profile will be created on next page load
      }

      if (isSignup) {
        const signupRole = consumeSignupRole();
        const leadData = consumeSignupLead();

        if (signupRole) {
          try {
            const profileUpdate: Record<string, string> = { role: signupRole };
            if (leadData?.city) profileUpdate.city = leadData.city;
            if (leadData?.state) profileUpdate.state = leadData.state;
            if (leadData?.zip) profileUpdate.zip = leadData.zip;
            if (leadData?.address) profileUpdate.address = leadData.address;
            if (leadData?.business_name) profileUpdate.company_name = leadData.business_name;
            if (leadData?.contact_name) profileUpdate.full_name = leadData.contact_name;
            if (leadData?.phone) profileUpdate.phone = leadData.phone;

            await fetch("/api/auth/me", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify(profileUpdate),
            });
          } catch {
            // Profile update is best-effort
          }
        }
        if (leadData) {
          try {
            await fetch("/api/auth/signup-lead", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                ...leadData,
                email: leadData.email || session.user.email,
              }),
            });
          } catch {
            // Lead creation is best-effort during signup
          }
        }
      } else {
        // Clean up any stale signup role from prior flows
        consumeSignupRole();
      }

      const redirectTo = consumeRedirectAfterLogin() || "/dashboard";
      window.location.href = redirectTo;
    }

    handleCallback();
    return () => {
      cancelled = true;
    };
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
