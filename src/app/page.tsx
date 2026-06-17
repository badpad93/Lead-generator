"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import {
  MapPin,
  Truck,
  ClipboardList,
  Package,
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
  UserPlus,
  Banknote,
} from "lucide-react";
import Tooltip from "@/app/components/Tooltip";
import { TOOLTIP_COPY } from "@/lib/tooltipCopy";
import ScrollProgress from "@/app/components/ScrollProgress";
import AnimatedCounter from "@/app/components/AnimatedCounter";
import { useScrollReveal, useScrollRevealGroup } from "@/hooks/useScrollReveal";
import { useCardTilt } from "@/hooks/useCardTilt";

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

const operatorSteps = [
  {
    icon: UserPlus,
    title: "Create a Profile",
    description: "Sign up and build your operator profile to get started",
  },
  {
    icon: Search,
    title: "Search Locations",
    description: "Browse available locations that match your market and preferences",
  },
  {
    icon: Package,
    title: "Place Your Vending Machine",
    description: "Secure a location, deliver your machine, and start earning",
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

function getStatNumber(s: string): number {
  const match = s.replace(/[+,]/g, "").match(/[\d.]+/);
  if (!match) return 0;
  const num = parseFloat(match[0]);
  if (s.includes("k")) return Math.round(num * 1000);
  return Math.round(num);
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
      "Vending Connector helped me place 12 machines in just 2 months. The quality of location requests is outstanding — every lead was a real opportunity, not a dead end.",
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
      "As a gym owner, I always wanted healthy vending options but never knew where to start. Vending Connector connected me with an operator who specializes in fitness nutrition.",
    name: "Maria L.",
    role: "Gym Owner",
    location: "Denver, CO",
    initials: "ML",
  },
];

/* ------------------------------------------------------------------ */
/*  3D CTA Card                                                        */
/* ------------------------------------------------------------------ */
function CTACard({
  href,
  icon: Icon,
  title,
  description,
  buttonText,
  buttonStyle,
  tooltip,
  iconBg,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  buttonText: string;
  buttonStyle: string;
  tooltip?: string;
  iconBg: string;
}) {
  const { ref, handleMouseMove, handleMouseLeave } = useCardTilt(6);

  const card = (
    <Link
      href={href}
      className="group relative block rounded-2xl border border-green-200/60 bg-white p-7 shadow-lg shadow-green-primary/5 transition-shadow duration-300 hover:shadow-xl hover:shadow-green-primary/10"
      aria-label={tooltip}
    >
      <div className="card-3d-shine rounded-2xl" />
      <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${iconBg} transition-colors`}>
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-1.5 text-lg font-bold text-black-primary">{title}</h3>
      <p className="mb-5 text-sm leading-relaxed text-black-primary/60">{description}</p>
      <span className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-colors btn-press btn-ripple ${buttonStyle}`}>
        {buttonText}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="card-3d-inner"
      style={{ transition: "transform 0.3s cubic-bezier(0.03, 0.98, 0.52, 0.99)" }}
    >
      {tooltip ? <Tooltip content={tooltip} position="top">{card}</Tooltip> : card}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hearth Widget                                                      */
/* ------------------------------------------------------------------ */
function HearthWidget() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (document.getElementById("hearth-script")) return;

    const script = document.createElement("script");
    script.id = "hearth-script";
    script.src = "https://widget.gethearth.com/script.js";
    script.setAttribute("data-orgid", "63488");
    script.setAttribute("data-partner", "bytebite-vending-llc");
    script.async = true;
    containerRef.current.appendChild(script);
  }, []);

  return (
    <section className="bg-light py-14 sm:py-16">
      <div ref={containerRef} className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
        <h3 className="text-xl font-bold text-black-primary sm:text-2xl mb-6">
          Estimate Your Monthly Payment
        </h3>
        <div className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
          <iframe id="hearth-widget_calculator_v1" title="Hearth Financing Calculator" className="w-full min-h-[400px] border-0" />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const router = useRouter();
  const [stats, setStats] = useState<PlatformStats | null>(null);

  // Scroll reveal refs
  const howItWorksRef = useScrollReveal<HTMLDivElement>();
  const howItWorksGridRef = useScrollRevealGroup(".reveal-item");
  const operatorRef = useScrollReveal<HTMLDivElement>();
  const operatorGridRef = useScrollRevealGroup(".reveal-item");
  const financingRef = useScrollReveal<HTMLDivElement>();
  const statsRef = useScrollReveal<HTMLDivElement>();
  const locationHeaderRef = useScrollReveal<HTMLDivElement>();
  const locationGridRef = useScrollRevealGroup(".reveal-item");
  const testimonialsHeaderRef = useScrollReveal<HTMLDivElement>();
  const testimonialsGridRef = useScrollRevealGroup(".reveal-item");
  const ctaRef = useScrollReveal<HTMLDivElement>();

  useEffect(() => {
    try {
      const supabase = createBrowserClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) router.replace("/dashboard");
      }).catch(() => {});
    } catch {}
  }, [router]);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const statItems = [
    { label: "Active Requests", value: stats ? formatStat(stats.activeRequests) : "...", icon: Zap },
    { label: "Verified Operators", value: stats ? formatStat(Math.max(stats.operators, 200)) : "200+", icon: Users },
    { label: "Successful Placements", value: "98+", icon: TrendingUp },
    { label: "States Covered", value: "48", icon: Globe },
  ];

  return (
    <div className="overflow-hidden grain">
      <ScrollProgress />

      {/* ============================================================ */}
      {/*  HERO                                                        */}
      {/* ============================================================ */}
      <section className="relative bg-gradient-to-b from-light to-light-warm">
        {/* Animated morphing blobs */}
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-green-100/60 blur-[120px] animate-blob" />
        <div className="pointer-events-none absolute -right-40 top-20 h-[350px] w-[350px] rounded-full bg-green-200/40 blur-[100px] animate-float" />
        <div className="pointer-events-none absolute -left-20 top-60 h-[250px] w-[250px] rounded-full bg-green-100/30 blur-[80px] animate-float-delayed" />

        <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-14 sm:px-6 sm:pb-28 sm:pt-24 lg:px-8 lg:pb-32 lg:pt-28">
          {/* Headline */}
          <h1
            className="animate-fade-in mx-auto max-w-4xl text-center text-2xl font-extrabold leading-tight tracking-tight text-black-primary sm:text-5xl lg:text-6xl"
            style={{ animationDelay: "0.1s" }}
          >
            The Smarter Way to Place{" "}
            <span className="bg-gradient-to-r from-green-primary via-green-dark to-green-primary bg-clip-text text-transparent animate-gradient">
              Vending Machines
            </span>
          </h1>

          {/* Catch phrase */}
          <p
            className="animate-fade-in mx-auto mt-4 max-w-2xl text-center text-xs font-semibold tracking-wide text-green-primary/80 uppercase sm:text-lg"
            style={{ animationDelay: "0.15s" }}
          >
            A World Class Vending Connection
          </p>

          {/* Sub-headline */}
          <p
            className="animate-fade-in mx-auto mt-3 max-w-2xl text-center text-base leading-relaxed text-black-primary/70 sm:text-xl"
            style={{ animationDelay: "0.2s" }}
          >
            Connect locations that need machines with operators ready to serve
            &mdash; instantly.
          </p>

          {/* Request Location Services + Buy Machines CTAs */}
          <div className="animate-fade-in mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: "0.25s" }}>
            <Tooltip content={TOOLTIP_COPY["Request Location Services"]} position="top">
              <Link
                href="/signup?redirect=/request-location"
                aria-label={TOOLTIP_COPY["Request Location Services"]}
                title={TOOLTIP_COPY["Request Location Services"]}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-green-primary/25 transition-all hover:-translate-y-0.5 hover:bg-green-hover sm:w-auto btn-press btn-ripple btn-shimmer"
              >
                <MapPin className="h-4 w-4" />
                Request Location Services
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Tooltip>
            <Link
              href="/signup?redirect=/machines-for-sale"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-green-primary/40 bg-white px-6 py-3 text-sm font-semibold text-green-primary shadow-sm transition-all hover:-translate-y-0.5 hover:bg-green-50 sm:w-auto btn-press"
            >
              <Package className="h-4 w-4" />
              Shop Machines
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* CTA Cards with 3D tilt */}
          <div
            className="animate-slide-up mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-4 sm:mt-12 sm:gap-5 sm:grid-cols-2"
            style={{ animationDelay: "0.3s" }}
          >
            <CTACard
              href="/signup?redirect=/post-request"
              icon={MapPin}
              title="I Need a Vending Machine"
              description="Post your location and get matched with verified operators"
              buttonText="Post a Request"
              buttonStyle="bg-green-primary text-white group-hover:bg-green-hover"
              tooltip={TOOLTIP_COPY["Post a Request"]}
              iconBg="bg-green-50 text-green-primary group-hover:bg-green-100"
            />
            <CTACard
              href="/signup?redirect=/browse-requests"
              icon={Truck}
              title="I'm a Vending Operator"
              description="Browse open locations and grow your vending business"
              buttonText="Locations for Sale"
              buttonStyle="bg-black-primary text-white group-hover:bg-black-light"
              tooltip={TOOLTIP_COPY["Locations for Sale"]}
              iconBg="bg-black-primary/5 text-black-primary group-hover:bg-black-primary/10"
            />
          </div>
        </div>

        {/* Curved divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg
            viewBox="0 0 1440 60"
            fill="none"
            className="w-full text-light"
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
      <section className="bg-light py-14 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div ref={howItWorksRef} className="reveal text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-black-primary sm:text-4xl">
              How Vending Connector Works
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-black-primary/60 sm:text-lg">
              Four simple steps from listing to a fully installed machine.
            </p>
          </div>

          {/* Steps */}
          <div ref={howItWorksGridRef} className="mt-10 grid grid-cols-1 gap-6 sm:mt-16 sm:gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="reveal-item group relative text-center"
                >
                  {/* Connector line (desktop only) */}
                  {idx < steps.length - 1 && (
                    <div className="pointer-events-none absolute left-[calc(50%+40px)] top-10 hidden h-0.5 w-[calc(100%-80px)] bg-gradient-to-r from-green-200 to-green-100 lg:block" />
                  )}

                  {/* Numbered circle */}
                  <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
                    <div className="absolute inset-0 rounded-2xl bg-green-50 transition-all duration-300 group-hover:bg-green-100 group-hover:scale-110" />
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
      {/*  HOW IT WORKS — OPERATORS                                     */}
      {/* ============================================================ */}
      <section className="bg-light-warm/50 py-14 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div ref={operatorRef} className="reveal text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-black-primary sm:text-4xl">
              How It Works for Operators
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-black-primary/60 sm:text-lg">
              Three simple steps to grow your vending business.
            </p>
          </div>

          <div ref={operatorGridRef} className="mt-10 grid grid-cols-1 gap-6 sm:mt-16 sm:gap-8 sm:grid-cols-3">
            {operatorSteps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="reveal-item group relative text-center"
                >
                  {idx < operatorSteps.length - 1 && (
                    <div className="pointer-events-none absolute left-[calc(50%+40px)] top-10 hidden h-0.5 w-[calc(100%-80px)] bg-gradient-to-r from-green-200 to-green-100 sm:block" />
                  )}
                  <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
                    <div className="absolute inset-0 rounded-2xl bg-green-50 transition-all duration-300 group-hover:bg-green-100 group-hover:scale-110" />
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
      {/*  FINANCING CTA                                                */}
      {/* ============================================================ */}
      <section className="bg-gradient-to-r from-green-primary to-green-dark py-14 sm:py-16">
        <div ref={financingRef} className="reveal mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center sm:flex-row sm:text-left sm:justify-between gap-6">
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                <Banknote className="h-6 w-6 text-white/90" />
                <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
                  Need Financing?
                </h2>
              </div>
              <p className="text-base text-white/80 max-w-lg">
                Pre-qualify for SBA financing to fund your Apex AI Vending micro-market business. Low interest rates, trusted lenders, quick screening.
              </p>
            </div>
            <Link
              href="/signup?redirect=/financing"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-green-primary shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl sm:w-auto shrink-0 btn-press btn-shimmer"
            >
              Pre-Qualify Now
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  HEARTH FINANCING WIDGET                                      */}
      {/* ============================================================ */}
      <HearthWidget />

      {/* ============================================================ */}
      {/*  STATS BAR                                                    */}
      {/* ============================================================ */}
      <section className="bg-green-primary">
        <div ref={statsRef} className="reveal mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
          <div className="grid grid-cols-2 gap-4 text-center sm:gap-4 lg:grid-cols-4">
            {statItems.map((stat) => {
              const Icon = stat.icon;
              const numericValue = getStatNumber(stat.value);
              const suffix = stat.value.includes("k") ? "k+" : stat.value.includes("+") ? "+" : "";
              return (
                <div key={stat.label}>
                  <Icon className="mx-auto mb-2 h-6 w-6 text-white/80" />
                  <p className="text-2xl font-extrabold text-white sm:text-4xl">
                    {numericValue > 0 ? (
                      <AnimatedCounter
                        target={numericValue}
                        suffix={suffix}
                        duration={2200}
                      />
                    ) : (
                      stat.value
                    )}
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
      <section className="bg-light py-14 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div ref={locationHeaderRef} className="reveal text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-black-primary sm:text-4xl">
              Every Location Type, Covered
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-black-primary/60 sm:text-lg">
              Whether you manage an office building or run a gym, Vending Connector
              connects you with the right operator.
            </p>
          </div>

          {/* Grid */}
          <div ref={locationGridRef} className="mt-10 grid grid-cols-2 gap-3 sm:mt-14 sm:gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {locationTypes.map((loc) => {
              const Icon = loc.icon;
              return (
                <div
                  key={loc.name}
                  className="reveal-item group rounded-2xl border border-green-100 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-green-200 hover:shadow-md"
                >
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-primary transition-all duration-300 group-hover:bg-green-100 group-hover:scale-110">
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
      <section className="bg-light-warm/50 py-14 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div ref={testimonialsHeaderRef} className="reveal text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-black-primary sm:text-4xl">
              What Our Users Say
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-black-primary/60 sm:text-lg">
              Trusted by operators and location owners across the country.
            </p>
          </div>

          {/* Cards */}
          <div ref={testimonialsGridRef} className="mt-10 grid grid-cols-1 gap-4 sm:mt-14 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="reveal-item flex flex-col rounded-2xl border border-green-100 bg-white p-7 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1"
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
        <div className="pointer-events-none absolute -left-40 -top-40 h-80 w-80 rounded-full bg-green-primary/10 blur-[100px] animate-float" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-green-primary/10 blur-[100px] animate-float-delayed" />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div ref={ctaRef} className="reveal mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Ready to Get Started?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-white/60 sm:text-lg">
              Join hundreds of operators and location owners already growing
              with Vending Connector. It takes less than two minutes.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Tooltip content={TOOLTIP_COPY["Post a Request"]} position="top">
                <Link
                  href="/signup?redirect=/post-request"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-primary px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-green-primary/25 transition-all hover:-translate-y-0.5 hover:bg-green-hover hover:shadow-xl hover:shadow-green-primary/30 sm:w-auto btn-press btn-ripple btn-shimmer"
                  aria-label={TOOLTIP_COPY["Post a Request"]}
                >
                  Post a Request
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Tooltip>
              <Tooltip content={TOOLTIP_COPY["Browse Operators"]} position="top">
                <Link
                  href="/signup?redirect=/browse-operators"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-white/20 bg-transparent px-7 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/5 sm:w-auto btn-press"
                  aria-label={TOOLTIP_COPY["Browse Operators"]}
                >
                  Browse Operators
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Tooltip>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
