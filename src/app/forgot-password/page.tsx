"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const redirectTo =
        (typeof window !== "undefined" ? window.location.origin : "https://vendingconnector.com") +
        "/reset-password";
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo }
      );
      if (resetErr) {
        // Don't reveal whether the email exists — show success either way.
        // But surface a real error if it's something else like rate limit.
        if (resetErr.message?.toLowerCase().includes("rate")) {
          setError(resetErr.message);
          setSending(false);
          return;
        }
      }
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    }
    setSending(false);
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-green-primary" />
            </div>
            <h1 className="text-2xl font-bold text-black-primary mb-2">Forgot password?</h1>
            <p className="text-sm text-black-primary/60">
              Enter the email associated with your account and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          {sent ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm text-center">
              If an account exists for <strong>{email}</strong>, a reset link has been sent. Check your inbox.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={sending}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary/30 disabled:bg-gray-50"
                  autoComplete="email"
                />
              </div>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={sending}
                className="w-full py-3 px-4 bg-green-primary hover:bg-green-hover text-white font-semibold rounded-xl transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending reset link...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link href="/login" className="text-sm text-black-primary/60 hover:text-black-primary">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
