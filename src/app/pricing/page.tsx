"use client";

import Link from "next/link";
import {
  Check,
  Shield,
  MapPin,
  Eye,
  Lock,
  Building2,
} from "lucide-react";

const freeFeatures = [
  { icon: Eye, text: "Browse all locations and operators" },
  { icon: MapPin, text: "View city, state, and industry for every listing" },
  { icon: Building2, text: "See machine types, urgency, and commission status" },
];

const purchasedFeatures = [
  { icon: Check, text: "Full location name and street address" },
  { icon: Check, text: "Zip code and complete contact details" },
  { icon: Check, text: "Full description and business information" },
  { icon: Check, text: "Daily traffic data and pricing details" },
];

export default function PricingPage() {
  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      {/* Hero */}
      <section className="border-b border-green-100 bg-gradient-to-b from-light-warm to-light">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-14 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-black-primary sm:text-4xl">
            Purchase Individual Leads
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-gray-600 sm:text-lg">
            Browse for free. Only pay for the leads you want. No commitments.
          </p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Free tier */}
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="text-center mb-6">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Free Access
              </p>
              <div className="mt-3 flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold text-black-primary">$0</span>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Browse and discover available leads
              </p>
            </div>

            <ul className="space-y-3 mb-8">
              {freeFeatures.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-50">
                    <Icon className="h-3.5 w-3.5 text-green-primary" />
                  </div>
                  <span className="text-sm text-black-primary">{text}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/browse-requests"
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-6 py-3.5 text-base font-semibold text-black-primary transition-colors hover:border-green-primary/40 hover:bg-green-50"
            >
              Start Browsing
            </Link>
          </div>

          {/* Per-lead purchase */}
          <div className="rounded-2xl border-2 border-green-primary bg-white p-8 shadow-lg shadow-green-primary/5">
            <div className="text-center mb-6">
              <p className="text-sm font-medium text-green-primary uppercase tracking-wide">
                Per-Lead Purchase
              </p>
              <div className="mt-3 flex items-baseline justify-center gap-1">
                <span className="text-3xl font-bold text-black-primary">Pay Per Lead</span>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Unlock full details for individual locations or operators
              </p>
            </div>

            <ul className="space-y-3 mb-8">
              {purchasedFeatures.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-50">
                    <Icon className="h-3.5 w-3.5 text-green-primary" />
                  </div>
                  <span className="text-sm text-black-primary">{text}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/browse-requests"
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-primary px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
            >
              Browse &amp; Purchase Leads
            </Link>

            <p className="mt-4 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
              <Shield className="h-3 w-3" />
              Secure payments powered by Stripe
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-12 rounded-2xl border border-gray-200 bg-white p-8">
          <h2 className="text-xl font-bold text-black-primary text-center mb-6">
            How It Works
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-primary">
                <Eye className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-black-primary">1. Browse Free</h3>
              <p className="mt-1 text-sm text-gray-500">
                View city, state, and industry for all listings at no cost.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-primary">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-black-primary">2. Purchase Leads</h3>
              <p className="mt-1 text-sm text-gray-500">
                Click the purchase button on any lead to pay securely via Stripe and unlock full details.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-primary">
                <Building2 className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-black-primary">3. Connect</h3>
              <p className="mt-1 text-sm text-gray-500">
                Once purchased, reach out to locations directly to start the placement process.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
