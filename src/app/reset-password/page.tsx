"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Lock, Loader2, CheckCircle2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Parse access_token hash if present (Supabase reset link uses implicit flow)
    if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const supabase = createBrowserClient();
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(() => {
            setSessionReady(true);
            window.history.replaceState(null, "", window.location.pathname);
          });
        return;
      }
    }

    // Otherwise just check current session
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message);
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password");
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
              {done ? (
                <CheckCircle2 className="w-8 h-8 text-green-primary" />
              ) : (
                <Lock className="w-8 h-8 text-green-primary" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-black-primary mb-2">
              {done ? "Password updated" : "Reset your password"}
            </h1>
            <p className="text-sm text-black-primary/60">
              {done
                ? "Your password has been changed. You can now sign in with your new password."
                : "Enter a new password for your account."}
            </p>
          </div>

          {done ? (
            <Link
              href="/login"
              className="block w-full text-center py-3 px-4 bg-green-primary hover:bg-green-hover text-white font-semibold rounded-xl transition-colors"
            >
              Sign In
            </Link>
          ) : !sessionReady ? (
            <div className="text-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-green-primary mx-auto" />
              <p className="text-sm text-black-primary/60 mt-2">Verifying reset link...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary/30 disabled:bg-gray-50"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="Re-enter your password"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary/30 disabled:bg-gray-50"
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 bg-green-primary hover:bg-green-hover text-white font-semibold rounded-xl transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating password...
                  </>
                ) : (
                  "Update Password"
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
