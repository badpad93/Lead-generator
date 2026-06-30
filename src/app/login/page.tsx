"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { signInWithGoogle, signInWithMicrosoft, signInWithYahoo, storeRedirectAfterLogin } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabase";

function LoginContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<"google" | "microsoft" | "yahoo" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) setError(decodeURIComponent(urlError));
  }, [searchParams]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        try {
          const res = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const profile = await res.json();
            if (!profile.phone || !profile.address || !profile.city || !profile.state || !profile.zip) {
              window.location.href = "/complete-profile";
              return;
            }
          }
        } catch {}
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

  function handleYahooLogin() {
    setLoading("yahoo");
    setError(null);
    const redirect = searchParams.get("redirect") || "/dashboard";
    storeRedirectAfterLogin(redirect);
    signInWithYahoo();
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }
    setLoading("email");
    try {
      const supabase = createBrowserClient();
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInErr || !data.session) {
        setError(signInErr?.message || "Invalid email or password");
        setLoading(null);
        return;
      }

      // Verify email_verified on profile before letting them in
      const profileRes = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        if (profile.email_verified === false) {
          window.location.href = "/verify-email-required";
          return;
        }
        if (!profile.phone || !profile.address || !profile.city || !profile.state || !profile.zip) {
          window.location.href = "/complete-profile";
          return;
        }
      }

      const redirect = searchParams.get("redirect") || "/dashboard";
      window.location.href = redirect;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
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
          <h1 className="text-2xl font-bold text-black-primary sm:text-3xl">Welcome Back</h1>
          <p className="text-black-primary/60 mt-2">Sign in to your Vending Connector account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-8">
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

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or</span></div>
          </div>

          {/* Yahoo OAuth Button */}
          <button
            type="button"
            onClick={handleYahooLogin}
            disabled={!!loading}
            className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700
              font-semibold rounded-xl transition-colors disabled:opacity-50
              disabled:cursor-not-allowed flex items-center justify-center gap-3
              cursor-pointer border border-gray-300 shadow-sm"
          >
            {loading === "yahoo" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Connecting to Yahoo...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M13.31 9.693l4.655-9.693h-3.516l-2.889 6.487L8.682 0H5.168l4.61 9.693L9.047 24h3.476l.787-14.307z" fill="#6001D2"/>
                </svg>
                Continue with Yahoo
              </>
            )}
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or sign in with email</span></div>
          </div>

          {/* Email/Password Sign In */}
          <form onSubmit={handleEmailLogin} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!loading}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary/30 disabled:bg-gray-50"
                autoComplete="email"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-600">Password</label>
                <a href="/forgot-password" className="text-xs text-green-primary hover:underline">Forgot password?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!!loading}
                placeholder="Enter your password"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary/30 disabled:bg-gray-50"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={!!loading}
              className="w-full py-3 px-4 bg-green-primary hover:bg-green-hover text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading === "email" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-black-primary/40">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>

        {/* Footer link */}
        <p className="text-center mt-6 text-sm text-black-primary/60">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="text-green-primary hover:underline font-medium">
            Create one
          </a>
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
