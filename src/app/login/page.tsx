"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { signInWithGoogle, signInWithMicrosoft, storeRedirectAfterLogin } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabase";

function LoginContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<"google" | "microsoft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const redirect = searchParams.get("redirect") || "/dashboard";
        window.location.href = redirect;
      } else {
        setChecking(false);
      }
    });
  }, [searchParams]);

  async function handleGoogleLogin() {
    setLoading("google");
    setError(null);
    const redirect = searchParams.get("redirect") || "/dashboard";
    storeRedirectAfterLogin(redirect);
    try {
      await signInWithGoogle();
    } catch {
      setError("Failed to start Google login. Please try again.");
      setLoading(null);
    }
  }

  async function handleMicrosoftLogin() {
    setLoading("microsoft");
    setError(null);
    const redirect = searchParams.get("redirect") || "/dashboard";
    storeRedirectAfterLogin(redirect);
    try {
      await signInWithMicrosoft();
    } catch {
      setError("Failed to start Microsoft login. Please try again.");
      setLoading(null);
    }
  }

  if (checking) {
    return (
      <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4">
        <Loader2 className="w-8 h-8 animate-spin text-green-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black-primary">Welcome Back</h1>
          <p className="text-black-primary/60 mt-2">Sign in to your Vending Connector account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {/* Error alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={!!loading}
            className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700
              font-semibold rounded-xl transition-colors disabled:opacity-50
              disabled:cursor-not-allowed flex items-center justify-center gap-3
              cursor-pointer border border-gray-300 shadow-sm"
          >
            {loading === "google" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Connecting to Google...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or</span></div>
          </div>

          {/* Microsoft OAuth Button */}
          <button
            type="button"
            onClick={handleMicrosoftLogin}
            disabled={!!loading}
            className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700
              font-semibold rounded-xl transition-colors disabled:opacity-50
              disabled:cursor-not-allowed flex items-center justify-center gap-3
              cursor-pointer border border-gray-300 shadow-sm"
          >
            {loading === "microsoft" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Connecting to Microsoft...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                </svg>
                Continue with Microsoft
              </>
            )}
          </button>

          <div className="mt-6 text-center">
            <p className="text-xs text-black-primary/40">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>

        {/* Footer link */}
        <p className="text-center mt-6 text-sm text-black-primary/60">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-green-primary hover:underline font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
