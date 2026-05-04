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

      // Explicitly exchange the OAuth code for a session. Doing this
      // synchronously (instead of relying on detectSessionInUrl +
      // onAuthStateChange) guarantees that the auth cookies are fully
      // written before we navigate, so the middleware sees the session on
      // the very next request. Without this, the user had to log in twice
      // because the first redirect raced the cookie write.
      const code = searchParams.get("code");
      if (!code) {
        setError("Missing authorization code. Please try again.");
        setTimeout(() => { window.location.href = "/login"; }, 2000);
        return;
      }

      const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;
      if (exchangeErr || !data.session) {
        setError(exchangeErr?.message || "Failed to complete sign-in.");
        setTimeout(() => { window.location.href = "/login"; }, 2000);
        return;
      }

      if (isSignup) {
        const signupRole = consumeSignupRole();
        const leadData = consumeSignupLead();

        if (signupRole) {
          try {
            const profileUpdate: Record<string, string> = { role: signupRole };
            if (leadData?.city) profileUpdate.city = leadData.city;
            if (leadData?.state) profileUpdate.state = leadData.state;
            if (leadData?.address) profileUpdate.address = leadData.address;
            if (leadData?.business_name) profileUpdate.company_name = leadData.business_name;
            if (leadData?.contact_name) profileUpdate.full_name = leadData.contact_name;
            if (leadData?.phone) profileUpdate.phone = leadData.phone;

            await fetch("/api/auth/me", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${data.session.access_token}`,
              },
              body: JSON.stringify(profileUpdate),
            });
          } catch {
            // Profile might not exist yet — ignore
          }
        }
        if (leadData) {
          try {
            await fetch("/api/auth/signup-lead", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${data.session.access_token}`,
              },
              body: JSON.stringify({
                ...leadData,
                email: leadData.email || data.session.user.email,
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
