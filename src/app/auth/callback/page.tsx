"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { consumeSignupRole } from "@/lib/auth";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      const supabase = createBrowserClient();

      // Exchange the code/hash for a session — this also writes cookies
      // via the SSR-compatible browser client.
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(
          window.location.href
        );

      // Fall back to getSession if code exchange wasn't applicable (hash-based flow)
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if ((exchangeError && sessionError) || !session) {
        setError("Authentication failed. Please try again.");
        setTimeout(() => router.push("/login"), 2000);
        return;
      }

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
          // Profile might not exist yet if trigger hasn't fired — ignore
        }
      }

      // Redirect to the page they were trying to reach, or dashboard
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect") || "/dashboard";
      router.push(redirect);
    }

    handleCallback();
  }, [router]);

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
