"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

export default function VerifyEmailRequiredPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setEmail(session.user.email);
    });
  }, []);

  async function handleResend() {
    if (!email) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send verification email");
      } else {
        setSent(true);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSending(false);
  }

  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-black-primary mb-2">Verify your email</h1>
          <p className="text-sm text-black-primary/60 mb-6">
            We need to confirm your email address before you can access this part of Vending Connector.
            {email && (
              <>
                {" "}A verification email was sent to <strong className="text-black-primary">{email}</strong>.
              </>
            )}
          </p>

          {sent && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
              Verification email sent. Check your inbox.
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleResend}
            disabled={sending || !email}
            className="block w-full py-3 px-4 bg-green-primary hover:bg-green-hover text-white font-semibold rounded-xl transition-colors disabled:opacity-50 cursor-pointer mb-3"
          >
            {sending ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending...</span>
            ) : (
              "Resend Verification Email"
            )}
          </button>

          <button
            onClick={handleSignOut}
            className="block w-full py-3 px-4 border border-gray-200 text-black-primary hover:bg-gray-50 font-medium rounded-xl transition-colors cursor-pointer"
          >
            Sign Out
          </button>

          <p className="mt-6 text-xs text-black-primary/40">
            Already verified? <Link href="/login" className="text-green-primary hover:underline">Sign in again</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
