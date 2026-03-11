"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  Shield,
  Zap,
  Users,
  MapPin,
  Star,
  CreditCard,
} from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabase";

const features = [
  { icon: MapPin, text: "Browse & post unlimited vending requests" },
  { icon: Users, text: "Connect with operators and location managers" },
  { icon: Zap, text: "Post routes for sale" },
  { icon: Star, text: "Access all operator listings" },
  { icon: Shield, text: "Verified profile badge eligibility" },
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setCheckingAuth(false);
        return;
      }

      setIsLoggedIn(true);

      try {
        const res = await fetch("/api/subscription", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.subscribed) {
            setAlreadySubscribed(true);
          }
        }
      } catch {
        // ignore
      }
      setCheckingAuth(false);
    }

    check();
  }, []);

  async function handleSubscribe() {
    setError(null);
    setLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        // Not logged in — redirect to signup
        router.push("/signup");
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === "string" ? data.error : "Something went wrong.");
        return;
      }

      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      {/* Hero */}
      <section className="border-b border-green-100 bg-gradient-to-b from-light-warm to-light">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-14 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-black-primary sm:text-4xl">
            Unlock Full Access to Vending Connector
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-gray-600 sm:text-lg">
            One simple plan. Everything you need to grow your vending business.
          </p>
        </div>
      </section>

      {/* Pricing card */}
      <section className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <div className="rounded-2xl border-2 border-green-primary bg-white p-8 shadow-lg shadow-green-primary/5">
          {/* Price */}
          <div className="text-center mb-6">
            <p className="text-sm font-medium text-green-primary uppercase tracking-wide">
              Monthly Membership
            </p>
            <div className="mt-3 flex items-baseline justify-center gap-1">
              <span className="text-5xl font-bold text-black-primary">$19</span>
              <span className="text-2xl font-bold text-black-primary">.99</span>
              <span className="ml-1 text-base text-gray-500">/month</span>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Cancel anytime. No long-term commitment.
            </p>
          </div>

          {/* Features */}
          <ul className="space-y-3 mb-8">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-50">
                  <Check className="h-3.5 w-3.5 text-green-primary" />
                </div>
                <span className="text-sm text-black-primary">{text}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
              {error}
            </div>
          )}

          {checkingAuth ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
            </div>
          ) : alreadySubscribed ? (
            <div className="text-center py-3">
              <div className="inline-flex items-center gap-2 rounded-xl bg-green-50 px-5 py-3 text-sm font-semibold text-green-700">
                <Check className="h-5 w-5" />
                You&apos;re already subscribed!
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-primary px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Redirecting to checkout...
                </>
              ) : (
                <>
                  <CreditCard className="h-5 w-5" />
                  {isLoggedIn ? "Subscribe Now" : "Get Started"}
                </>
              )}
            </button>
          )}

          {/* Security note */}
          <p className="mt-4 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
            <Shield className="h-3 w-3" />
            Secure payment powered by Stripe
          </p>
        </div>
      </section>
    </div>
  );
}
