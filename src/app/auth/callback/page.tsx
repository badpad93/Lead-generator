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
      // Determine the flow from URL param (primary) or localStorage fallback.
      const flowParam = searchParams.get("flow");
      const storedFlow = consumeAuthFlow();
      const flow = flowParam || storedFlow || "login";
      const isSignup = flow === "signup";

      const urlError = searchParams.get("error_description") || searchParams.get("error");
      if (urlError) {
        setError(urlError);
        setTimeout(() => {
          window.location.href = "/login?error=" + encodeURIComponent(urlError);
        }, 2000);
        return;
      }

      const code = searchParams.get("code");
      if (!code) {
        setError("Missing authorization code. Please try again.");
        setTimeout(() => {
          window.location.href = "/login?error=" + encodeURIComponent("Missing authorization code. Please try signing in again.");
        }, 2000);
        return;
      }

      const supabase = createBrowserClient();
      const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;

      if (exchangeErr || !data.session) {
        const raw = exchangeErr?.message || "Failed to complete sign-in.";
        const msg = raw.includes("code verifier")
          ? "Session expired. Please try signing in again."
          : raw;
        setError(msg);
        setTimeout(() => {
          window.location.href = "/login?error=" + encodeURIComponent(msg);
        }, 2000);
        return;
      }

      const session = data.session;

      let isEmployeeSignup = false;

      if (isSignup) {
        const urlRole = searchParams.get("role");
        const signupRole = urlRole || consumeSignupRole();
        const leadData = consumeSignupLead();

        isEmployeeSignup = signupRole === "employee";
        const profileRole = isEmployeeSignup ? "sales" : signupRole;

        // Ensure the profile exists first (auto-creates for new OAuth users via GET)
        try {
          await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
        } catch {
          // Best-effort — profile will be created on next page load
        }

        // Now patch the profile with the correct role and signup data
        if (profileRole) {
          try {
            const profileUpdate: Record<string, string> = { role: profileRole };
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
        consumeSignupRole();
        // Ensure the profile exists for login flow
        try {
          await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
        } catch {
          // Best-effort
        }
      }

      // Always verify profile is complete — for BOTH signup and login.
      // localStorage data can be lost during OAuth redirect (domain mismatch,
      // browser clearing storage, etc.), so the signup PATCH may silently fail.
      try {
        const profileRes = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          if (!profile.phone || !profile.address || !profile.city || !profile.state || !profile.zip) {
            window.location.href = "/complete-profile";
            return;
          }
        }
      } catch {}

      const savedRedirect = consumeRedirectAfterLogin();
      window.location.href = savedRedirect || (isEmployeeSignup ? "/sales" : "/dashboard");
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
