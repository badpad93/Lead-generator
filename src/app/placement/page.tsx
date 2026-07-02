"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowRight, CheckCircle2, Clock, Building2, Briefcase, Package, Users, Star, Bell } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Partner {
  id: string;
  business_name: string | null;
  partner_type: string;
  onboarding_complete: boolean;
  active: boolean;
  identity_verified_at: string | null;
  w9_uploaded_at: string | null;
  agreement_signed_at: string | null;
  bank_verified_at: string | null;
  rating: number | null;
  rating_count: number | null;
  partner_tier: "bronze" | "silver" | "gold" | null;
  partner_score: number | null;
}

const TIER_STYLE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  bronze: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300", label: "Bronze" },
  silver: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300", label: "Silver" },
  gold: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-400", label: "Gold" },
};

export default function PlacementDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<Partner | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { router.push("/login?redirect=/placement"); return; }
      const res = await fetch("/api/marketplace/partners", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPartner(data.partner);
      }
      setLoading(false);
    }
    init();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
      </div>
    );
  }

  // Not onboarded yet — CTA
  if (!partner || !partner.onboarding_complete) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-6">
          <Building2 className="h-8 w-8 text-green-primary" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Placement Partner Program</h1>
        <p className="text-gray-500 mb-8">
          Earn per-location fees by finding and securing vending locations for operators. Set your territory, work at your own pace, get paid on placement.
        </p>
        <Link
          href="/placement/onboarding"
          className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-8 py-3 text-sm font-semibold text-white cursor-pointer"
        >
          Get Started <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  // Awaiting verification
  const verified = partner.identity_verified_at && partner.w9_uploaded_at && partner.agreement_signed_at && partner.active;
  if (!verified) {
    const steps = [
      { label: "Profile", done: true },
      { label: "Identity Verification", done: !!partner.identity_verified_at },
      { label: "W-9 Verified", done: !!partner.w9_uploaded_at },
      { label: "Platform Agreement Countersigned", done: !!partner.agreement_signed_at },
      { label: "Bank / Payout Info", done: !!partner.bank_verified_at },
    ];
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome{partner.business_name ? `, ${partner.business_name}` : ""}</h1>
        <p className="text-sm text-gray-500 mb-6">Your profile is complete — we just need to verify a few things before contracts unlock.</p>

        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Verification Progress</h2>
          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                {s.done ? (
                  <CheckCircle2 className="h-5 w-5 text-green-primary shrink-0" />
                ) : (
                  <Clock className="h-5 w-5 text-gray-300 shrink-0" />
                )}
                <span className={`text-sm ${s.done ? "text-gray-900 font-medium" : "text-gray-500"}`}>{s.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-gray-500 border-t border-gray-100 pt-4">
            Typical turnaround is 1 business day. We&apos;ll email you the moment you&apos;re approved.
          </p>
        </div>
      </div>
    );
  }

  // Fully verified — dashboard with contracts + submissions cards
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Placement Partner Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back{partner.business_name ? `, ${partner.business_name}` : ""}. Pick up a contract or track a submission below.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {partner.partner_tier && (() => {
            const style = TIER_STYLE[partner.partner_tier];
            return (
              <div className={`rounded-2xl border px-4 py-2 ${style.bg} ${style.border}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wide ${style.text}`}>Tier</p>
                <p className={`text-lg font-bold ${style.text}`}>{style.label}</p>
                {partner.partner_score != null && (
                  <p className={`text-[10px] ${style.text}`}>Score {Number(partner.partner_score).toFixed(0)}/100</p>
                )}
              </div>
            );
          })()}
          {partner.rating != null && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="text-lg font-bold text-amber-900">{Number(partner.rating).toFixed(1)}</span>
                <span className="text-xs text-amber-700 ml-1">/ 5</span>
              </div>
              <p className="text-[10px] text-amber-700">from {partner.rating_count || 0} rating{(partner.rating_count || 0) === 1 ? "" : "s"}</p>
            </div>
          )}
          <Link
            href="/placement/settings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer"
          >
            <Bell className="h-4 w-4" /> Settings
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/placement/contracts"
          className="group rounded-2xl border border-gray-100 bg-white p-6 hover:border-green-200 hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
              <Briefcase className="h-6 w-6 text-green-primary" />
            </div>
            <ArrowRight className="h-5 w-5 text-gray-300 group-hover:text-green-primary transition-colors" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Available Contracts</h2>
          <p className="text-sm text-gray-500">Browse open contracts eligible for your territory and industries.</p>
        </Link>

        <Link
          href="/placement/submissions"
          className="group rounded-2xl border border-gray-100 bg-white p-6 hover:border-green-200 hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
            <ArrowRight className="h-5 w-5 text-gray-300 group-hover:text-green-primary transition-colors" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">My Submissions</h2>
          <p className="text-sm text-gray-500">Track candidate locations you&apos;ve submitted and see approval status.</p>
        </Link>

        <Link
          href="/placement/team"
          className="group rounded-2xl border border-gray-100 bg-white p-6 hover:border-green-200 hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <ArrowRight className="h-5 w-5 text-gray-300 group-hover:text-green-primary transition-colors" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Team</h2>
          <p className="text-sm text-gray-500">Invite locators to your company. They log in with their own account and work under yours.</p>
        </Link>
      </div>
    </div>
  );
}
