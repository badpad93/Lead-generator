"use client";

/**
 * ProductJourney — the scroll-through product tour on the homepage.
 *
 * Customer feedback: visitors like to scroll. So instead of a
 * compact card grid, each product/service gets a full alternating
 * feature panel the visitor moves through as they scroll — big
 * headline, real description, highlight bullets, and a button that
 * sends them to that product's page.
 *
 * Reveal-on-scroll is IntersectionObserver + CSS transitions — no
 * animation library. Sections start slightly translated + faded and
 * settle in the first time they enter the viewport (one-shot; no
 * re-hiding on scroll-up, which reads as flicker). Respects
 * prefers-reduced-motion by revealing everything immediately.
 */

import Link from "next/link";
import Reveal from "@/app/components/Reveal";
import {
  Package,
  Banknote,
  Coffee,
  Store,
  MapPin,
  Globe,
  Briefcase,
  Route,
  ArrowRight,
  Check,
  type LucideIcon,
} from "lucide-react";
import { trackEvent, HomepageEvents } from "@/lib/analytics";

export interface JourneyFeature {
  icon: LucideIcon;
  kicker: string;
  title: string;
  description: string;
  highlights: string[];
  href: string;
  ctaLabel: string;
  eventName?: string;
}

type Feature = JourneyFeature;

const FEATURES: Feature[] = [
  {
    icon: Package,
    kicker: "Equipment",
    title: "Machines Built for Modern Routes",
    description:
      "Browse AI-powered coolers, snack and drink machines, combos, and specialty equipment listed by operators and manufacturers nationwide. Compare, buy, and get machines shipped to your route.",
    highlights: [
      "AI smart coolers and traditional vending",
      "New and operator-listed equipment",
      "Nationwide shipping and freight support",
    ],
    href: "/machines-for-sale",
    ctaLabel: "Shop Machines",
    eventName: HomepageEvents.machines,
  },
  {
    icon: Banknote,
    kicker: "Financing",
    title: "10-Year Machine Financing",
    description:
      "Don't let capital slow your growth. Qualifying operators can finance vending equipment on long-term plans — including 10-year terms — so new machines pay for themselves from day one.",
    highlights: [
      "Long-term plans up to 10 years",
      "Finance single machines or whole fleets",
      "Simple application, fast decisions",
    ],
    href: "/financing",
    ctaLabel: "Explore Financing",
    eventName: HomepageEvents.financing,
  },
  {
    icon: Coffee,
    kicker: "Coffee Program",
    title: "Free Commercial Coffee Brewers",
    description:
      "Add coffee to your route with qualifying free brewer opportunities. Sign the supply agreement, get the commercial brewer at no charge, and order coffee, cups, and supplies at operator pricing from our marketplace.",
    highlights: [
      "Free brewer with the supply agreement",
      "Wholesale coffee, cups, and supplies",
      "Auto-approved — start ordering immediately",
    ],
    href: "/coffee",
    ctaLabel: "Start With Coffee",
    eventName: HomepageEvents.coffee,
  },
  {
    icon: Store,
    kicker: "Coffee Storefronts",
    title: "Your Own Branded Coffee Storefront",
    description:
      "Operators can launch a branded online coffee shop and resell to their own customers. Your logo, your colors, your prices — we handle fulfillment, invoicing, and pay you commission on every order.",
    highlights: [
      "Branded page at your own storefront link",
      "Set your customer pricing, earn the margin",
      "Fulfillment and invoicing handled for you",
    ],
    href: "/signup",
    ctaLabel: "Launch a Storefront",
    eventName: HomepageEvents.getStarted,
  },
  {
    icon: MapPin,
    kicker: "Location Services",
    title: "Locations, Sourced for You",
    description:
      "Placing machines is the hardest part of vending. Tell us your market and machine types, and our team sources qualified locations for you — priced by traffic, hours, and machine count.",
    highlights: [
      "Qualified placements in your service area",
      "Transparent per-location pricing tiers",
      "Deposit-based start, pay as locations land",
    ],
    href: "/request-location",
    ctaLabel: "Request Locations",
    eventName: HomepageEvents.location,
  },
  {
    icon: Globe,
    kicker: "Web Presence",
    title: "A Professional Vending Website",
    description:
      "Win more accounts with a website that makes your operation look as professional as it runs. Built for vending operators — credibility, lead capture, and your services front and center.",
    highlights: [
      "Designed for vending operators",
      "Lead capture built in",
      "Launch fast, no tech skills needed",
    ],
    href: "/website-services",
    ctaLabel: "View Website Services",
    eventName: HomepageEvents.website,
  },
  {
    icon: Briefcase,
    kicker: "Placement Marketplace",
    title: "Placement Providers Keep 100%",
    description:
      "Turn location relationships into revenue. List vending placements on our transactional marketplace, connect directly with active operators, and keep your full locator commission — no platform cut.",
    highlights: [
      "No platform commission",
      "Transact directly with operators",
      "Monetize your placement network",
    ],
    href: "/placement",
    ctaLabel: "Join as a Placement Provider",
    eventName: HomepageEvents.placementProvider,
  },
  {
    icon: Route,
    kicker: "Routes",
    title: "Established Routes for Sale",
    description:
      "Skip the cold start. Browse established vending routes with existing locations and cash flow, or list your own route when it's time to sell.",
    highlights: [
      "Routes with locations already producing",
      "Buy to expand or list yours to exit",
      "Connect directly with sellers",
    ],
    href: "/routes-for-sale",
    ctaLabel: "Browse Routes",
  },
];

/**
 * Signed-in variant of the tour — same offerings, but the copy and
 * CTAs speak to an existing account: coffee goes straight to the
 * marketplace, storefronts go straight to setup, no signup detours.
 * Mounted at the bottom of the dashboard so the tiles stay the
 * fast path and the scroll adds depth ("redundancy in a scroll
 * format", per product direction).
 */
export const DASHBOARD_FEATURES: JourneyFeature[] = [
  {
    icon: Package,
    kicker: "Equipment",
    title: "Add Machines to Your Route",
    description:
      "Browse AI-powered coolers, snack and drink machines, combos, and specialty equipment listed nationwide. Compare, buy, and get machines shipped to your route.",
    highlights: [
      "AI smart coolers and traditional vending",
      "New and operator-listed equipment",
      "Nationwide shipping and freight support",
    ],
    href: "/machines-for-sale",
    ctaLabel: "Shop Machines",
    eventName: HomepageEvents.machines,
  },
  {
    icon: Banknote,
    kicker: "Financing",
    title: "Finance Your Next Machines",
    description:
      "Qualifying operators can finance vending equipment on long-term plans — including 10-year terms — so new machines pay for themselves from day one.",
    highlights: [
      "Long-term plans up to 10 years",
      "Finance single machines or whole fleets",
      "Simple application, fast decisions",
    ],
    href: "/financing",
    ctaLabel: "Explore Financing",
    eventName: HomepageEvents.financing,
  },
  {
    icon: Coffee,
    kicker: "Coffee Program",
    title: "Order Coffee, Cups & Supplies",
    description:
      "Shop the coffee marketplace at operator pricing — and if you haven't joined yet, qualifying operators get a free commercial brewer with the supply agreement.",
    highlights: [
      "Wholesale coffee, cups, and supplies",
      "Free brewer with the supply agreement",
      "Order online, pay at checkout",
    ],
    href: "/coffee",
    ctaLabel: "Open the Coffee Marketplace",
    eventName: HomepageEvents.coffee,
  },
  {
    icon: Store,
    kicker: "Coffee Storefronts",
    title: "Resell Coffee Under Your Brand",
    description:
      "Launch a branded online coffee shop for your own customers. Your logo, your colors, your prices — we handle fulfillment and invoicing, and you earn commission on every order.",
    highlights: [
      "Branded page at your own storefront link",
      "Set your customer pricing, earn the margin",
      "Signed the coffee agreement? You're live instantly",
    ],
    href: "/coffee/storefront",
    ctaLabel: "Set Up My Storefront",
    eventName: HomepageEvents.getStarted,
  },
  {
    icon: MapPin,
    kicker: "Location Services",
    title: "Let Us Source Your Locations",
    description:
      "Tell us your market and machine types, and our team sources qualified placements for you — priced by traffic, hours, and machine count.",
    highlights: [
      "Qualified placements in your service area",
      "Transparent per-location pricing tiers",
      "Deposit-based start, pay as locations land",
    ],
    href: "/request-location",
    ctaLabel: "Request Locations",
    eventName: HomepageEvents.location,
  },
  {
    icon: Globe,
    kicker: "Web Presence",
    title: "Get a Professional Vending Website",
    description:
      "Win more accounts with a website that makes your operation look as professional as it runs — credibility, lead capture, and your services front and center.",
    highlights: [
      "Designed for vending operators",
      "Lead capture built in",
      "Launch fast, no tech skills needed",
    ],
    href: "/website-services",
    ctaLabel: "View Website Services",
    eventName: HomepageEvents.website,
  },
  {
    icon: Briefcase,
    kicker: "Placement Marketplace",
    title: "Buy & Sell Placements",
    description:
      "Find locations listed by Placement Providers, or list your own placements and keep 100% of your locator commission — no platform cut.",
    highlights: [
      "No platform commission",
      "Transact directly with operators",
      "Monetize your placement network",
    ],
    href: "/placement",
    ctaLabel: "Open the Placement Marketplace",
    eventName: HomepageEvents.placementProvider,
  },
  {
    icon: Route,
    kicker: "Routes",
    title: "Expand With Established Routes",
    description:
      "Skip the cold start. Browse routes with existing locations and cash flow, or list your own route when it's time to sell.",
    highlights: [
      "Routes with locations already producing",
      "Buy to expand or list yours to exit",
      "Connect directly with sellers",
    ],
    href: "/routes-for-sale",
    ctaLabel: "Browse Routes",
  },
];

export default function ProductJourney({
  features = FEATURES,
}: {
  features?: JourneyFeature[];
} = {}) {
  return (
    <div className="py-8 sm:py-12">
      {features.map((feature, i) => {
        const flipped = i % 2 === 1;
        const Icon = feature.icon;
        const number = String(i + 1).padStart(2, "0");
        const copyDir = flipped ? "right" : "left";
        const visualDir = flipped ? "left" : "right";
        return (
          <section key={feature.title} className="py-6 sm:py-8">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {/* Chapter card — each offering is its own visually
                  sectioned-off panel: rounded, bordered, gradient
                  ground, decorative blobs, hover lift. Cards + the
                  gap between them read as distinct chapters instead
                  of one continuous band. */}
              <div
                className={`relative overflow-hidden rounded-3xl border border-green-100 p-6 shadow-sm transition-shadow duration-500 hover:shadow-xl hover:shadow-green-primary/10 sm:p-10 lg:p-14 ${
                  flipped
                    ? "bg-gradient-to-bl from-light-warm via-white to-green-50/60"
                    : "bg-gradient-to-br from-white via-light-warm to-green-50/60"
                }`}
              >
                <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-green-100/50 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-28 -left-16 h-60 w-60 rounded-full bg-green-200/30 blur-3xl" />
                {/* Oversized ghost number anchors the chapter feel */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute -top-6 select-none text-[10rem] font-extrabold leading-none tracking-tighter text-green-primary/[0.06] sm:text-[13rem] ${
                    flipped ? "left-2" : "right-2"
                  }`}
                >
                  {number}
                </span>

                <div
                  className={`relative grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16 ${
                    flipped ? "lg:[&>*:first-child]:order-2" : ""
                  }`}
                >
                  {/* Copy side — staggered reveal: kicker → headline →
                      description → bullets (cascading) → CTA. */}
                  <div>
                    <Reveal direction={copyDir}>
                      <div className="flex items-center gap-3">
                        <span className="text-3xl font-extrabold tracking-tight text-green-primary/25 sm:text-4xl">
                          {number}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-green-primary">
                          <Icon className="h-3.5 w-3.5" />
                          {feature.kicker}
                        </span>
                      </div>
                    </Reveal>
                    <Reveal direction={copyDir} delay={100}>
                      <h3 className="mt-4 text-2xl font-bold leading-tight text-black-primary sm:text-3xl lg:text-4xl">
                        {feature.title}
                      </h3>
                    </Reveal>
                    <Reveal direction={copyDir} delay={200}>
                      <p className="mt-4 max-w-xl text-sm leading-relaxed text-gray-600 sm:text-base">
                        {feature.description}
                      </p>
                    </Reveal>
                    <ul className="mt-5 space-y-2.5">
                      {feature.highlights.map((point, j) => (
                        <Reveal key={point} direction={copyDir} delay={280 + j * 90}>
                          <li className="flex items-start gap-2.5">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-primary text-white">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </span>
                            <span className="text-sm font-medium text-black-primary">
                              {point}
                            </span>
                          </li>
                        </Reveal>
                      ))}
                    </ul>
                    <Reveal direction="up" delay={550}>
                      <div className="mt-7">
                        <Link
                          href={feature.href}
                          onClick={() =>
                            feature.eventName &&
                            trackEvent(feature.eventName, { source: "product_journey" })
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-hover hover:shadow-md"
                        >
                          {feature.ctaLabel}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </Reveal>
                  </div>

                  {/* Visual side — scales in from the opposite
                      direction, then the icon tile drifts on a
                      continuous float. Pure CSS so it renders
                      instantly; can be swapped for product
                      screenshots/photos later without touching
                      layout. */}
                  <Reveal direction={visualDir} delay={150} className="relative hidden lg:block">
                    <div className="relative overflow-hidden rounded-3xl border border-green-200 bg-white/70 p-12 shadow-sm backdrop-blur-sm">
                      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-green-100/70 blur-3xl" />
                      <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-green-200/40 blur-3xl" />
                      <div className="relative flex h-64 items-center justify-center">
                        <div className="animate-journey-float flex h-36 w-36 items-center justify-center rounded-3xl bg-white shadow-lg ring-1 ring-green-100">
                          <Icon className="h-20 w-20 text-green-primary" strokeWidth={1.5} />
                        </div>
                      </div>
                    </div>
                  </Reveal>
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
