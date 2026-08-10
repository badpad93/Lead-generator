"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";

export default function ClaimAccountPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/coffee/guest-claim/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "This link is no longer valid.");
        } else {
          setEmail(data.email);
        }
      } catch {
        setError("Failed to load claim page.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/coffee/guest-claim/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to set password.");
        return;
      }
      setClaimed(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
      </div>
    );
  }

  if (error && !email) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-lg bg-gray-900 border border-red-500/40 p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-semibold mb-2">Link not usable</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <Link href="/coffee" className="inline-block bg-green-500 text-black font-semibold px-6 py-3 rounded-lg hover:bg-green-400">
            Back to shop
          </Link>
        </div>
      </div>
    );
  }

  if (claimed) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-lg bg-gray-900 border border-green-500/40 p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-400 mb-4" />
          <h1 className="text-2xl font-semibold mb-2">Account claimed</h1>
          <p className="text-gray-400 mb-4">
            Your password is set. Redirecting you to sign in…
          </p>
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-green-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full rounded-lg bg-gray-900 border border-gray-800 p-8">
        <div className="text-center mb-6">
          <KeyRound className="mx-auto h-10 w-10 text-green-500 mb-3" />
          <h1 className="text-2xl font-semibold mb-1">Set your password</h1>
          <p className="text-sm text-gray-400">
            Set a password for <strong className="text-white">{email}</strong> to claim
            your account and access your order history.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-900/40 border border-red-500/40 p-3 mb-4 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-100">{error}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="block text-gray-400 mb-1">New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-gray-400 mb-1">Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </label>
          <p className="text-xs text-gray-500">
            At least 8 characters. You&apos;ll be signed in with this password afterwards.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 bg-green-500 text-black font-semibold px-6 py-3 rounded-lg hover:bg-green-400 disabled:opacity-50"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Setting password…</>
            ) : (
              "Claim account"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
