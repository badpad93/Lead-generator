"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Truck,
  ClipboardList,
  Search,
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  Building2,
  Dumbbell,
  GraduationCap,
  Heart,
  Home,
  Warehouse,
  BedDouble,
  ShoppingBag,
  Star,
  Zap,
  Users,
  TrendingUp,
  Globe,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const steps = [
  {
    icon: ClipboardList,
    title: "Post Your Location",
    description:
      "Describe your space, foot traffic, and machine preferences",
  },
  {
    icon: Search,
    title: "Get Matched",
    description:
      "Operators find your listing or browse available locations",
  },
  {
    icon: MessageSquare,
    title: "Connect & Agree",
    description:
      "Chat directly, discuss terms, and finalize the deal",
  },
  {
    icon: CheckCircle2,
    title: "Machine Installed",
    description:
      "Your vending machine arrives — everyone wins",
  },
];

interface PlatformStats {
  activeRequests: number;
  operators: number;
  placements: number;
}

function formatStat(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k+`;
  if (n > 0) return `${n}+`;
  return "0";
}

const locationTypes = [
  {
    icon: Building2,
    name: "Office",
    description: "Break rooms, lobbies, and co-working spaces",
  },
  {
    icon: Dumbbell,
    name: "Gym",
    description: "Fitness centers, yoga studios, and health clubs",
  },
  {
    icon: GraduationCap,
    name: "School",
    description: "Universities, colleges, and K-12 campuses",
  },
  {
    icon: Heart,
    name: "Hospital",
    description: "Waiting rooms, staff lounges, and visitor areas",
  },
  {
    icon: Home,
    name: "Apartment",
    description: "Residential complexes and community centers",
  },
  {
    icon: Warehouse,
    name: "Warehouse",
    description: "Distribution centers and industrial facilities",
  },
  {
    icon: BedDouble,
    name: "Hotel",
    description: "Hotel lobbies, conference centers, and resorts",
  },
  {
    icon: ShoppingBag,
    name: "Retail",
    description: "Shopping malls, storefronts, and retail parks",
  },
];

const testimonials = [
  {
    quote:
      "VendHub helped me place 12 machines in just 2 months. The quality of location requests is outstanding — every lead was a real opportunity, not a dead end.",
    name: "Sarah M.",
    role: "Vending Operator",
    location: "Phoenix, AZ",
    initials: "SM",
  },
  {
    quote:
      "We needed a coffee machine for our office lobby. Within a week, we had three operators bidding for the spot. The whole process was seamless.",
    name: "James T.",
    role: "Property Manager",
    location: "Dallas, TX",
    initials: "JT",
  },
  {
    quote:
      "As a gym owner, I always wanted healthy vending options but never knew where to start. VendHub connected me with an operator who specializes in fitness nutrition.",
    name: "Maria L.",
    role: "Gym Owner",
    location: "Denver, CO",
    initials: "ML",
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const statItems = [
    { label: "Active Requests", value: stats ? formatStat(stats.activeRequests) : "...", icon: Zap },
    { label: "Verified Operators", value: stats ? formatStat(stats.operators) : "...", icon: Users },
    { label: "Successful Placements", value: stats ? formatStat(stats.placements) : "...", icon: TrendingUp },
    { label: "States Covered", value: "48", icon: Globe },
  ];

  return (
    <div className="overflow-hidden">
      {/* ============================================================ */}
      {/*  HERO                                                        */}
      {/* ============================================================ */}
      <section className="relative bg-gradient-to-b from-light to-light-warm">
        {/* Decorative blurred circles */}
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-green-100/60 blur-[120px]" />
        <div className="pointer-events-none absolute -right-40 top-20 h-[350px] w-[350px] rounded-full bg-green-200/40 blur-[100px]" />

        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:px-8 lg:pb-32 lg:pt-28">
          {/* Badge */}
          <div className="animate-fade-in mb-6 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-white/80 px-4 py-1.5 text-sm font-medium text-green-primary shadow-sm backdrop-blur-sm">
              <Star className="h-4 w-4 fill-green-primary text-green-primary" />
              The #1 Vending Machine Marketplace
            </span>
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-in mx-auto max-w-4xl text-center text-4xl font-extrabold leading-tight tracking-tight text-black-primary sm:text-5xl lg:text-6xl"
            style={{ animationDelay: "0.1s" }}
          >
            The Smarter Way to Place{" "}
            <span className="bg-gradient-to-r from-green-primary to-green-dark bg-clip-text text-transparent">
              Vending Machines
            </span>
          </h1>

          {/* Sub-headline */}
          <p
            className="animate-fade-in mx-auto mt-5 max-w-2xl text-center text-lg leading-relaxed text-black-primary/70 sm:text-xl"
            style={{ animationDelay: "0.2s" }}
          >
            Connect locations that need machines with operators ready to serve
            &mdash; instantly.
          </p>

          {/* CTA Cards */}
          <div
            className="animate-slide-up mx-auto mt-12 grid max-w-3xl gap-5 sm:grid-cols-2"
            style={{ animationDelay: "0.3s" }}
          >
            {/* Card — Location Owner */}
            <Link
              href="/post-request"
              className="group relative rounded-2xl border border-green-200/60 bg-white p-7 shadow-lg shadow-green-primary/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-green-primary/10"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-primary transition-colors group-hover:bg-green-100">
                <MapPin className="h-6 w-6" />
              </div>
              <h3 className="mb-1.5 text-lg font-bold text-black-primary">
                I Need a Vending Machine
              </h3>
              <p className="mb-5 text-sm leading-relaxed text-black-primary/60">
                Post your location and get matched with verified operators
              </p>
              <span className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors group-hover:bg-green-hover">
                Post a Request
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>

            {/* Card — Operator */}
            <Link
              href="/browse-requests"
              className="group relative rounded-2xl border border-navy/10 bg-white p-7 shadow-lg shadow-navy/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-navy/10"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-black-primary/5 text-black-primary transition-colors group-hover:bg-black-primary/10">
                <Truck className="h-6 w-6" />
              </div>
              <h3 className="mb-1.5 text-lg font-bold text-black-primary">
                I&apos;m a Vending Operator
              </h3>
              <p className="mb-5 text-sm leading-relaxed text-black-primary/60">
                Browse open locations and grow your vending business
              </p>
              <span className="inline-flex items-center gap-2 rounded-xl bg-black-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors group-hover:bg-black-primary-light">
                Browse Locations
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>
        </div>

        {/* Curved divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg
            viewBox="0 0 1440 60"
            fill="none"
            className="w-full text-cream"
            preserveAspectRatio="none"
          >
            <path
              d="M0 60L1440 60L1440 0C1440 0 1080 60 720 60C360 60 0 0 0 0L0 60Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  HOW IT WORKS                                                 */}
      {/* ============================================================ */}
      <section className="bg-light py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="animate-fade-in text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-black-primary sm:text-4xl">
              How VendHub Works
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-black-primary/60 sm:text-lg">
              Four simple steps from listing to a fully installed machine.
            </p>
          </div>

          {/* Steps */}
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="animate-slide-up group relative text-center"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  {/* Connector line (desktop only) */}
                  {idx < steps.length - 1 && (
                    <div className="pointer-events-none absolute left-[calc(50%+40px)] top-10 hidden h-0.5 w-[calc(100%-80px)] bg-gradient-to-r from-green-200 to-green-100 lg:block" />
                  )}

                  {/* Numbered circle */}
                  <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
                    <div className="absolute inset-0 rounded-2xl bg-green-50 transition-colors group-hover:bg-green-100" />
                    <Icon className="relative h-8 w-8 text-green-primary" />
                    <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-primary text-xs font-bold text-white shadow-sm">
                      {idx + 1}
                    </span>
                  </div>

                  <h3 className="mb-2 text-lg font-bold text-black-primary">
                    {step.title}
                  </h3>
                  <p className="mx-auto max-w-[240px] text-sm leading-relaxed text-black-primary/60">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  STATS BAR                                                    */}
      {/* ============================================================ */}
      <section className="bg-green-primary">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
          <div className="grid grid-cols-2 gap-8 text-center sm:gap-4 lg:grid-cols-4">
            {statItems.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="animate-fade-in">
                  <Icon className="mx-auto mb-2 h-6 w-6 text-white/80" />
                  <p className="text-3xl font-extrabold text-white sm:text-4xl">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-sm font-medium text-white/80">
                    {stat.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  LOCATION TYPES                                               */}
      {/* ============================================================ */}
      <section className="bg-light py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="animate-fade-in text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-black-primary sm:text-4xl">
              Every Location Type, Covered
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-black-primary/60 sm:text-lg">
              Whether you manage an office building or run a gym, VendHub
              connects you with the right operator.
            </p>
          </div>

          {/* Grid */}
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {locationTypes.map((loc, idx) => {
              const Icon = loc.icon;
              return (
                <div
                  key={loc.name}
                  className="animate-slide-up group rounded-2xl border border-green-100 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-green-200 hover:shadow-md"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-primary transition-colors group-hover:bg-green-100">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-1 text-base font-bold text-black-primary">
                    {loc.name}
                  </h3>
                  <p className="text-sm leading-relaxed text-black-primary/55">
                    {loc.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  TESTIMONIALS                                                 */}
      {/* ============================================================ */}
      <section className="bg-light-warm/50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="animate-fade-in text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-black-primary sm:text-4xl">
              What Our Users Say
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-black-primary/60 sm:text-lg">
              Trusted by operators and location owners across the country.
            </p>
          </div>

          {/* Cards */}
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t, idx) => (
              <div
                key={t.name}
                className="animate-slide-up flex flex-col rounded-2xl border border-green-100 bg-white p-7 shadow-sm transition-shadow duration-300 hover:shadow-md"
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                {/* Stars */}
                <div className="mb-4 flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-green-primary text-green-primary"
                    />
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="mb-6 flex-1 text-sm leading-relaxed text-black-primary/70">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>

                {/* Author */}
                <div className="flex items-center gap-3 border-t border-green-50 pt-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-primary text-sm font-bold text-white">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-black-primary">
                      {t.name}
                    </p>
                    <p className="text-xs text-black-primary/50">
                      {t.role} &middot; {t.location}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FINAL CTA                                                    */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden bg-black-primary">
        {/* Decorative elements */}
        <div className="pointer-events-none absolute -left-40 -top-40 h-80 w-80 rounded-full bg-green-primary/10 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-green-primary/10 blur-[100px]" />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="animate-fade-in mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Ready to Get Started?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-white/60 sm:text-lg">
              Join hundreds of operators and location owners already growing
              with VendHub. It takes less than two minutes.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/post-request"
                className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-green-primary/25 transition-all hover:-translate-y-0.5 hover:bg-green-hover hover:shadow-xl hover:shadow-green-primary/30"
              >
                Post a Request
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/browse-operators"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-white/20 bg-transparent px-7 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/5"
              >
                Browse Operators
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
