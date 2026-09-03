"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  MapPin,
  Briefcase,
  Banknote,
  Coffee,
  Globe,
  Package,
  Landmark,
  LogIn,
  ArrowRight,
  Check,
  ClipboardList,
  Search,
  Handshake,
  TrendingUp,
  Star,
  ShieldCheck,
  Store,
  Users,
  Sparkles,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import ScrollProgress from "@/app/components/ScrollProgress";
import MarketingGondola from "@/app/components/marketing/MarketingGondola";
import PathCard from "@/app/components/homepage/PathCard";
import ProductJourney from "@/app/components/homepage/ProductJourney";
import AudienceCard from "@/app/components/homepage/AudienceCard";
import GrowthSolutionItem from "@/app/components/homepage/GrowthSolutionItem";
import { trackEvent, HomepageEvents } from "@/lib/analytics";

/* ================================================================== */
/*  Data — routes reference actually-existing pages verified in audit  */
/* ================================================================== */

const PATH_CARDS = [
  {
    icon: User,
    title: "I'm an Operator",
    description: "Find equipment, locations, financing and services to grow your vending business.",
    href: "/signup",
    eventName: HomepageEvents.operator,
  },
  {
    icon: MapPin,
    title: "I Need a Location",
    description: "Get help finding qualified locations for your vending equipment.",
    href: "/request-location",
    eventName: HomepageEvents.location,
  },
  {
    icon: Briefcase,
    title: "I'm a Placement Provider",
    description: "List vending placements, connect with operators and keep your commissions.",
    href: "/placement",
    eventName: HomepageEvents.placementProvider,
  },
  {
    icon: Banknote,
    title: "I Need Financing",
    description: "Explore long-term equipment financing options, including qualifying 10-year terms.",
    href: "/financing",
    eventName: HomepageEvents.financing,
  },
  {
    icon: Coffee,
    title: "I Want Free Coffee",
    description: "Add a commercial coffee program to your route with qualifying free brewer opportunities.",
    href: "/coffee",
    eventName: HomepageEvents.coffee,
  },
  {
    icon: Globe,
    title: "I Need a Website",
    description: "Get a professional vending website designed to increase credibility and generate opportunities.",
    href: "/website-services",
    eventName: HomepageEvents.website,
  },
  {
    icon: Package,
    title: "I Need Machines",
    description: "Browse vending equipment and AI-powered vending solutions.",
    href: "/machines-for-sale",
    eventName: HomepageEvents.machines,
  },
];

// SERVICE_CARDS grid retired — the scroll-through ProductJourney
// (components/homepage/ProductJourney.tsx) now carries every
// product/service as a full feature panel with its own CTA.

const AUDIENCE_CARDS = [
  {
    icon: TrendingUp,
    title: "Operators",
    description: "Grow faster with machines, locations, financing, coffee, websites and marketplace resources.",
    href: "/signup",
    ctaLabel: "Explore Operator Solutions",
    eventName: HomepageEvents.operator,
  },
  {
    icon: Store,
    title: "Location Owners",
    description: "Connect with vending operators and find the right unattended retail solution for your property or business.",
    href: "/request-location",
    ctaLabel: "Request Vending Service",
    eventName: HomepageEvents.location,
  },
  {
    icon: Briefcase,
    title: "Placement Providers",
    description: "Turn your location relationships into revenue through a marketplace designed to connect placements with active operators.",
    href: "/placement",
    ctaLabel: "Join as a Placement Provider",
    eventName: HomepageEvents.placementProvider,
  },
  {
    icon: Sparkles,
    title: "New Operators",
    description: "Starting or scaling a vending business? Access machines, financing, locations and business-growth services in one place.",
    href: "/signup",
    ctaLabel: "Start Here",
    eventName: HomepageEvents.getStarted,
  },
];

const GROWTH_SOLUTIONS = [
  { icon: Package, label: "Machines", href: "/machines-for-sale" },
  { icon: Banknote, label: "Machine Financing", href: "/financing" },
  { icon: Coffee, label: "Free Coffee Program", href: "/coffee" },
  { icon: MapPin, label: "Location Services", href: "/request-location" },
  { icon: Globe, label: "Website Services", href: "/website-services" },
  { icon: Briefcase, label: "Placement Marketplace", href: "/placement" },
  { icon: Users, label: "Operator Support", href: "/signup" },
];

const HOW_STEPS = [
  { icon: ClipboardList, title: "Choose Your Solution", description: "Select machines, locations, financing, coffee, websites or marketplace services." },
  { icon: Search, title: "Submit or Browse", description: "Submit your request, browse available opportunities or join the marketplace." },
  { icon: Handshake, title: "Connect", description: "Connect with Vending Connector, an operator, a Placement Provider or the appropriate service partner." },
  { icon: TrendingUp, title: "Grow", description: "Launch the solution and continue building your vending business." },
];

const TRUST_POINTS = [
  { icon: Globe, label: "Nationwide marketplace" },
  { icon: Sparkles, label: "Multiple vending growth solutions" },
  { icon: Users, label: "Operator-focused platform" },
  { icon: Briefcase, label: "Placement Provider marketplace" },
  { icon: Landmark, label: "Equipment and financing resources" },
  { icon: ShieldCheck, label: "Dedicated support" },
];

// Preserved from prior homepage (page.tsx:151-176). Real customer
// voices — not fabricated. Kept in a data array so the section can
// later be swapped for a CMS-fed collection without touching layout.
const TESTIMONIALS = [
  { name: "Sarah M.", role: "Location Owner", quote: "Listed our office and had three qualified operators reach out within a week. Made the whole process painless." },
  { name: "James T.", role: "Vending Operator", quote: "Vending Connector filled routes I'd been trying to build for months. The marketplace is a real time-saver." },
  { name: "Maria L.", role: "Placement Provider", quote: "Being able to list placements and transact directly with operators — without giving up commission — is exactly what this industry needed." },
];

/* ================================================================== */

export default function HomePageClient() {
  const router = useRouter();

  useEffect(() => {
    try {
      const supabase = createBrowserClient();
      supabase.auth
        .getSession()
        .then(({ data: { session } }) => {
          if (session) router.replace("/dashboard");
        })
        .catch(() => {});
    } catch {
      // Non-fatal — public browse still works.
    }
  }, [router]);

  return (
    <div className="overflow-hidden">
      <ScrollProgress />

      {/* ============================================================ */}
      {/*  0. MARKETING GONDOLA — sits directly under the header.      */}
      {/*     Rotating promo carousel shared with the logged-in        */}
      {/*     dashboard so both surfaces show the same "what we do"    */}
      {/*     showcase. Existing homepage sections below are           */}
      {/*     unchanged.                                               */}
      {/* ============================================================ */}
      <MarketingGondola />

      {/* ============================================================ */}
      {/*  1. HERO                                                     */}
      {/* ============================================================ */}
      <section className="relative bg-gradient-to-b from-light to-light-warm">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-green-100/60 blur-[120px]" />
        <div className="pointer-events-none absolute -right-40 top-20 h-[350px] w-[350px] rounded-full bg-green-200/40 blur-[100px]" />

        <div className="relative mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-6 sm:pt-24 sm:pb-14 lg:px-8 lg:pt-28">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-green-primary">
            A World Class Vending Connection
          </p>
          <h1 className="mx-auto max-w-4xl text-center text-3xl font-extrabold leading-tight tracking-tight text-black-primary sm:text-5xl lg:text-6xl">
            The Growth Platform for{" "}
            <span className="text-green-primary">Modern Vending</span>
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-center text-sm font-medium text-gray-600 sm:text-base">
            Machines. Financing. Coffee. Locations. Websites. Placement Providers.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-gray-500 sm:text-base">
            Grow your vending business with the equipment, financing, locations, services, and marketplace connections you need — all through Vending Connector.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              onClick={() => trackEvent(HomepageEvents.getStarted, { source: "hero" })}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-hover hover:shadow-md"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/machines-for-sale"
              onClick={() => trackEvent(HomepageEvents.machines, { source: "hero" })}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-primary/40 bg-white px-6 py-3 text-sm font-semibold text-green-primary transition-all hover:border-green-primary hover:bg-green-50"
            >
              Explore Machines
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  2. CHOOSE YOUR PATH                                         */}
      {/* ============================================================ */}
      <section className="relative -mt-4 bg-gradient-to-b from-light-warm to-white pb-16 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="text-xl font-bold text-black-primary sm:text-2xl">
              Choose Your Path
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Pick where you are — Vending Connector helps take the next step.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {PATH_CARDS.map((card) => (
              <PathCard key={card.title} {...card} />
            ))}
            {/* 8th tile — rounds out the xl:grid-cols-4 row.
                Not itself clickable so the two sub-CTAs can each own
                their intent (login vs. signup). Styled to match
                PathCard from the outside. */}
            <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-primary">
                <LogIn className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-black-primary sm:text-base">
                  Log In or Sign Up
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 sm:text-[13px]">
                  Already have an account? Log in. New to Vending Connector? Create one in seconds.
                </p>
                <div className="mt-3 flex gap-2">
                  <Link
                    href="/login"
                    className="inline-flex flex-1 items-center justify-center rounded-lg border border-green-primary/40 bg-white px-3 py-1.5 text-xs font-semibold text-green-primary transition-colors hover:border-green-primary hover:bg-green-50"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => trackEvent(HomepageEvents.getStarted, { source: "path_card" })}
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-green-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
                  >
                    Sign Up
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  3. PRODUCT JOURNEY — scroll-through tour of every product   */}
      {/*     and service. Replaces the compact ServiceCard grid per   */}
      {/*     customer feedback: visitors like to scroll, so each      */}
      {/*     offering gets a full alternating feature panel with a    */}
      {/*     CTA button to its page.                                  */}
      {/* ============================================================ */}
      <section className="bg-white pt-16 sm:pt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-green-primary">
              One Platform. Multiple Growth Solutions.
            </p>
            <h2 className="text-2xl font-bold text-black-primary sm:text-3xl lg:text-4xl">
              Everything Vending Connector Offers
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-gray-500 sm:text-base">
              Keep scrolling — every product and service, and the button that takes you there.
            </p>
          </div>
        </div>
      </section>
      <ProductJourney />

      {/* ============================================================ */}
      {/*  4. BUILT FOR EVERY SIDE                                     */}
      {/* ============================================================ */}
      <section className="bg-light-warm py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-black-primary sm:text-3xl lg:text-4xl">
              Built for Every Side of the Vending Industry
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCE_CARDS.map((card) => (
              <AudienceCard key={card.title} {...card} />
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  5. PLACEMENT PROVIDERS WELCOME                              */}
      {/* ============================================================ */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-green-200 bg-gradient-to-br from-green-50 via-white to-green-50 p-8 shadow-sm sm:p-12">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-green-100/60 blur-3xl" />
            <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-green-primary">
                  <Briefcase className="h-3.5 w-3.5" />
                  Placement Providers
                </span>
                <h2 className="mt-4 text-2xl font-bold text-black-primary sm:text-3xl lg:text-4xl">
                  Placement Providers Welcome
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-gray-600 sm:text-base">
                  Sell your vending placements through the Vending Connector transactional marketplace and connect with operators looking for opportunities. Placement Providers — sometimes referred to as vending locators — can list opportunities and transact directly.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/placement"
                    onClick={() => trackEvent(HomepageEvents.placementProvider, { source: "pp_welcome" })}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-hover hover:shadow-md"
                  >
                    Join as a Placement Provider
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/how-it-works"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-primary/40 bg-white px-5 py-2.5 text-sm font-semibold text-green-primary transition-all hover:border-green-primary hover:bg-green-50"
                  >
                    Learn How It Works
                  </Link>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  "No platform commission",
                  "Keep your locator commissions",
                  "Reach active vending operators",
                  "Monetize your placement network",
                ].map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 rounded-xl border border-green-100 bg-white/70 p-4 shadow-sm backdrop-blur-sm"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-primary text-white">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <span className="text-sm font-semibold text-black-primary">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  6. GROWTH SOLUTIONS BAND                                    */}
      {/* ============================================================ */}
      <section className="bg-light-warm py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0 lg:grid-cols-7">
            {GROWTH_SOLUTIONS.map((item) => (
              <GrowthSolutionItem key={item.label} {...item} />
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  7. HOW IT WORKS                                             */}
      {/* ============================================================ */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-black-primary sm:text-3xl lg:text-4xl">
              How Vending Connector Works
            </h2>
            <p className="mt-2 text-sm text-gray-500 sm:text-base">
              Start with what you need. Vending Connector helps connect the next steps.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_STEPS.map((step, i) => (
              <div
                key={step.title}
                className="relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-green-primary text-xs font-bold text-white shadow">
                  {i + 1}
                </div>
                <step.icon className="mb-3 h-5 w-5 text-green-primary" strokeWidth={2} />
                <h3 className="text-base font-semibold text-black-primary">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  8. TRUST / PROOF                                            */}
      {/* ============================================================ */}
      <section className="bg-light-warm py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-black-primary sm:text-3xl">
              Built to Help Vending Businesses Grow
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              A platform designed around what modern vending operators actually need.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {TRUST_POINTS.map((point) => (
              <div
                key={point.label}
                className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-primary">
                  <point.icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="text-xs font-semibold text-black-primary sm:text-sm">
                  {point.label}
                </span>
              </div>
            ))}
          </div>

          {/* Testimonials — preserved from prior homepage */}
          <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-3 flex gap-0.5 text-green-primary" aria-hidden>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <blockquote className="text-sm leading-relaxed text-gray-700">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 text-xs text-gray-500">
                  <span className="font-semibold text-black-primary">{t.name}</span> · {t.role}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  9. FINAL CTA                                                */}
      {/* ============================================================ */}
      <section className="bg-black-primary py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl lg:text-4xl">
            Grow Your Vending Business with{" "}
            <span className="text-green-primary">Vending Connector</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
            Whether you need machines, locations, financing, coffee, a better website, or placement opportunities, Vending Connector gives you a place to start.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              onClick={() => trackEvent(HomepageEvents.getStarted, { source: "final_cta" })}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-hover hover:shadow-md"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/request-location"
              onClick={() => trackEvent(HomepageEvents.location, { source: "final_cta" })}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Request Location Services
            </Link>
            <Link
              href="/placement"
              onClick={() => trackEvent(HomepageEvents.placementProvider, { source: "final_cta" })}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Become a Placement Provider
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
