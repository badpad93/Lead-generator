"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Crown,
  CheckCircle2,
  Eye,
  Phone,
  Star,
  MapPin,
  TrendingUp,
  Shield,
  Zap,
  Users,
  ArrowRight,
  Loader2,
  XCircle,
} from "lucide-react";
import { getAccessToken } from "@/lib/auth";

const BENEFITS = [
  {
    icon: Eye,
    title: "Full Profile Visibility",
    description:
      "Your name, company, bio, and contact info are displayed publicly. Non-featured operators are shown as anonymous.",
  },
  {
    icon: Phone,
    title: "Direct Contact",
    description:
      "Locations can call or email you directly instead of going through our 888 number. More leads, faster deals.",
  },
  {
    icon: TrendingUp,
    title: "Priority Placement",
    description:
      "Featured operators appear at the top of search results, above all non-featured operators in your state.",
  },
  {
    icon: Star,
    title: "Ratings & Reviews Shown",
    description:
      "Your star rating and review count are prominently displayed, helping you stand out from the competition.",
  },
  {
    icon: MapPin,
    title: "Full Address Displayed",
    description:
      "Locations can see your complete service address, building trust and making it easy for nearby businesses to choose you.",
  },
  {
    icon: Shield,
    title: "Verified Featured Badge",
    description:
      "A gold Featured Operator badge signals credibility and commitment, giving locations confidence to work with you.",
  },
];

const COMPARISONS = [
  { feature: "Listed in browse results", free: true, featured: true },
  { feature: "City & state shown", free: true, featured: true },
  { feature: "Verified badge", free: true, featured: true },
  { feature: "Company name visible", free: false, featured: true },
  { feature: "Full name visible", free: false, featured: true },
  { feature: "Direct phone number", free: false, featured: true },
  { feature: "Direct email contact", free: false, featured: true },
  { feature: "Bio & description", free: false, featured: true },
  { feature: "Full address shown", free: false, featured: true },
  { feature: "Star rating displayed", free: false, featured: true },
  { feature: "Priority search placement", free: false, featured: true },
  { feature: "Featured badge", free: false, featured: true },
];

export default function BecomeFeaturedPage() {
  const [token, setToken] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featuredData, setFeaturedData] = useState<{
    featured: boolean;
    state: string | null;
    slots_available: number;
    has_subscription: boolean;
  } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    getAccessToken().then((t) => {
      setToken(t);
      if (t) {
        fetch("/api/featured-subscription", {
          headers: { Authorization: `Bearer ${t}` },
        })
          .then((r) => r.json())
          .then(setFeaturedData)
          .catch(() => {})
          .finally(() => setLoadingStatus(false));
      } else {
        setLoadingStatus(false);
      }
    });
  }, []);

  async function handleSubscribe() {
    if (!token) return;
    setSubscribing(true);
    setError(null);
    try {
      const res = await fetch("/api/featured-subscription", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubscribing(false);
    }
  }

  const isLoggedIn = !!token;
  const alreadyFeatured = featuredData?.featured === true;
  const noState = isLoggedIn && !featuredData?.state;
  const noSlots = featuredData?.slots_available === 0;

  return (
    <div className="min-h-screen bg-light">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-green-100 bg-gradient-to-b from-amber-50 via-light-warm to-light">
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-16 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 mb-6">
            <Crown className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-700">Featured Operator Program</span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-black-primary sm:text-5xl">
            Get More Leads.<br />
            <span className="text-green-primary">Get Found First.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
            Featured operators get full profile visibility, direct contact from locations,
            and priority placement in search results. Stand out from the crowd for just
            <strong className="text-black-primary"> $29.99/month</strong>.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {loadingStatus ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                Checking status...
              </div>
            ) : alreadyFeatured ? (
              <div className="inline-flex items-center gap-2 rounded-xl bg-green-100 px-6 py-3 text-green-800 font-semibold">
                <CheckCircle2 className="h-5 w-5" />
                You&apos;re a Featured Operator
              </div>
            ) : isLoggedIn ? (
              <>
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing || noState || noSlots}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-600 hover:shadow-xl hover:shadow-amber-500/30 disabled:opacity-50 cursor-pointer"
                >
                  {subscribing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Redirecting to checkout...
                    </>
                  ) : (
                    <>
                      <Crown className="h-5 w-5" />
                      Become Featured — $29.99/mo
                    </>
                  )}
                </button>
                {featuredData?.state && featuredData.slots_available > 0 && (
                  <p className="text-sm text-gray-500">
                    {featuredData.slots_available} spot{featuredData.slots_available !== 1 ? "s" : ""} left in {featuredData.state}
                  </p>
                )}
              </>
            ) : (
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-600 hover:shadow-xl"
              >
                Sign Up as Operator
                <ArrowRight className="h-5 w-5" />
              </Link>
            )}
          </div>

          {error && (
            <div className="mx-auto mt-4 max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <XCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {noState && (
            <p className="mt-3 text-sm text-amber-600">
              <Link href="/dashboard" className="underline font-medium">Set your state in your profile</Link> before subscribing.
            </p>
          )}

          {noSlots && featuredData?.state && (
            <p className="mt-3 text-sm text-amber-600">
              All 3 featured spots in {featuredData.state} are taken. Check back later.
            </p>
          )}
        </div>
      </section>

      {/* What non-featured looks like */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-black-primary sm:text-3xl">
            What Locations See Today
          </h2>
          <p className="mt-3 text-gray-600 max-w-xl mx-auto">
            Without a featured subscription, your profile is anonymous. Locations only see your city and state —
            no name, no company, no way to contact you directly.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 max-w-3xl mx-auto">
          {/* Non-featured card */}
          <div className="rounded-xl border-2 border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Free Listing</p>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 font-bold">
                VO
              </div>
              <div>
                <p className="font-semibold text-gray-400">Verified Operator</p>
                <p className="text-sm text-gray-400">Denver, CO</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="h-3 bg-gray-100 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">Locations must call our 888 number to connect</p>
            </div>
          </div>

          {/* Featured card */}
          <div className="rounded-xl border-2 border-green-300 ring-1 ring-green-200 bg-white p-5 relative">
            <div className="absolute -top-3 left-4 inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white">
              <Crown className="h-3 w-3" />
              Featured
            </div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3 mt-1">$29.99/mo</p>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-12 w-12 rounded-full bg-green-primary flex items-center justify-center text-white font-bold">
                JR
              </div>
              <div>
                <p className="font-semibold text-black-primary">James Rodriguez</p>
                <p className="text-sm text-green-700 font-medium">Mile High Vending Co.</p>
                <p className="text-sm text-gray-500">Denver, CO</p>
              </div>
            </div>
            <div className="flex items-center gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={`h-3.5 w-3.5 ${i <= 4 ? "fill-green-primary text-green-primary" : "fill-none text-gray-300"}`} />
              ))}
              <span className="text-xs font-medium text-black-primary ml-1">4.8</span>
              <span className="text-xs text-gray-400">(24)</span>
            </div>
            <p className="text-sm text-gray-600 line-clamp-2">
              15+ years serving the Denver metro area. Full-service vending with healthy options, AI machines, and 24/7 support.
            </p>
            <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg bg-green-primary px-3 py-1.5 text-xs font-semibold text-white">
                <Phone className="h-3 w-3" />
                Call Operator
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-black-primary">
                View Profile
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits grid */}
      <section className="bg-white border-y border-gray-100">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-black-primary sm:text-3xl">
              Everything You Get as a Featured Operator
            </h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-black-primary">{title}</h3>
                  <p className="mt-1 text-sm text-gray-600 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-black-primary sm:text-3xl">
            Free vs. Featured
          </h2>
          <p className="mt-3 text-gray-600">See exactly what locations can see about you.</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 font-medium text-gray-500">Feature</th>
                <th className="text-center px-5 py-3 font-medium text-gray-500 w-28">Free</th>
                <th className="text-center px-5 py-3 font-semibold text-amber-600 w-28 bg-amber-50">
                  <span className="flex items-center justify-center gap-1">
                    <Crown className="h-3.5 w-3.5" />
                    Featured
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISONS.map(({ feature, free, featured }, i) => (
                <tr key={feature} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="px-5 py-3 text-black-primary">{feature}</td>
                  <td className="text-center px-5 py-3">
                    {free ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                    )}
                  </td>
                  <td className="text-center px-5 py-3 bg-amber-50/30">
                    {featured ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Social proof / stats */}
      <section className="bg-gradient-to-b from-green-50 to-light border-t border-green-100">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-3 text-center">
            <div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Users className="h-6 w-6 text-green-primary" />
              </div>
              <p className="text-3xl font-bold text-black-primary">3 max</p>
              <p className="text-sm text-gray-600 mt-1">Featured operators per state — exclusive, limited spots</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Zap className="h-6 w-6 text-green-primary" />
              </div>
              <p className="text-3xl font-bold text-black-primary">$29.99</p>
              <p className="text-sm text-gray-600 mt-1">Per month — cancel anytime, no long-term contracts</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingUp className="h-6 w-6 text-green-primary" />
              </div>
              <p className="text-3xl font-bold text-black-primary">Top of results</p>
              <p className="text-sm text-gray-600 mt-1">Featured operators always appear before free listings</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 text-center">
        <h2 className="text-2xl font-bold text-black-primary sm:text-3xl">
          Ready to stand out?
        </h2>
        <p className="mt-3 text-gray-600 max-w-lg mx-auto">
          Join the featured program and start getting direct leads from locations in your area.
          Limited to 3 operators per state — claim your spot today.
        </p>

        <div className="mt-8">
          {loadingStatus ? null : alreadyFeatured ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-8 py-3.5 text-base font-bold text-white transition-colors hover:bg-green-hover"
            >
              Go to Dashboard
              <ArrowRight className="h-5 w-5" />
            </Link>
          ) : isLoggedIn ? (
            <button
              onClick={handleSubscribe}
              disabled={subscribing || noState || noSlots}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-600 hover:shadow-xl disabled:opacity-50 cursor-pointer"
            >
              {subscribing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  <Crown className="h-5 w-5" />
                  Become Featured — $29.99/mo
                </>
              )}
            </button>
          ) : (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-600"
              >
                Sign Up as Operator
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-black-primary transition-colors hover:bg-gray-50"
              >
                Already have an account? Sign in
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
