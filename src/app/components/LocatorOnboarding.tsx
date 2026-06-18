"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

interface LocatorOnboardingProps {
  profile: { phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null };
  listings: { status: string }[];
}

export default function LocatorOnboarding({ profile, listings }: LocatorOnboardingProps) {
  const profileComplete = !!(profile.phone && profile.address && profile.city && profile.state && profile.zip);
  const hasListing = listings.length > 0;
  const ownerSigned = listings.some(l => l.status !== "pending_verification" && l.status !== "expired" && l.status !== "removed");
  const listingLive = listings.some(l => l.status === "active" || l.status === "sold");

  const allDone = profileComplete && hasListing && ownerSigned && listingLive;

  if (allDone) return null;

  const steps = [
    { label: "Complete your profile", done: profileComplete, href: "/complete-profile", action: "Edit Profile" },
    { label: "Create your first listing", done: hasListing, href: "/my-listings", action: "Create Listing" },
    { label: "Location owner signs agreement", done: ownerSigned, href: "/my-listings", action: "View Listings" },
    { label: "Listing goes live on marketplace", done: listingLive, href: "/my-listings", action: "View Listings" },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
      <h3 className="text-base font-bold text-gray-900 mb-1">Getting Started</h3>
      <p className="text-sm text-gray-500 mb-5">Complete these steps to start selling locations on the marketplace</p>
      <div className="space-y-4">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            {step.done ? (
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-gray-300 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className={`text-sm ${step.done ? "text-gray-400 line-through" : "text-gray-900 font-medium"}`}>
                {step.label}
              </span>
            </div>
            {!step.done && (
              <Link href={step.href} className="text-xs font-medium text-green-600 hover:text-green-700 whitespace-nowrap">
                {step.action} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
