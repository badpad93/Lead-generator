"use client";

/**
 * MarketingGondola — the rotating hero-height promo carousel that
 * sits directly under the site header on both the public homepage
 * and the logged-in dashboard.
 *
 * Rendered by:
 *   - src/app/HomePageClient.tsx (public /)
 *   - src/app/dashboard/page.tsx (authenticated /dashboard)
 *
 * Design goals — matches the Vending Connector visual language:
 *   - VC brand colors sourced from tailwind theme tokens
 *     (green-primary, green-hover, black-primary, light-warm) —
 *     never hard-coded hex.
 *   - Two-column composition on md+ (content left, product image
 *     right); stacked on mobile.
 *   - Auto-advance every AUTO_ADVANCE_MS; pauses when the user is
 *     hovering, focused, or has requested reduced motion.
 *   - Manual controls: prev/next arrows, dot indicators, keyboard
 *     left/right arrows, and touch swipe.
 *   - Only the first slide's image is priority-loaded; the rest lazy
 *     load once they enter view.
 *   - Every CTA points to an existing route verified in the
 *     codebase — no `#` or fake hrefs.
 *
 * Placeholder assets: the 5 SVGs at /public/images/marketing/*.svg
 * are stand-ins until the marketing photos are dropped in. Replacing
 * them is a single-line edit in the SLIDES array below.
 */

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Banknote,
  Package,
  Globe,
  TrendingUp,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useSyncExternalStore,
} from "react";
import type { GondolaSlot } from "@/lib/marketingGondola";

const AUTO_ADVANCE_MS = 12_000;
// Any horizontal swipe wider than this (in pixels) counts as a slide
// change. Below the threshold we ignore it so vertical scrolls on
// mobile don't accidentally trigger navigation.
const SWIPE_THRESHOLD_PX = 40;

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets?: string[];
  image: { src: string; alt: string };
  cta: { label: string; href: string };
  icon: typeof Coffee;
};

// Every href below points to an existing page in the app router —
// verified against `find src/app -name page.tsx`.
const SLIDES: Slide[] = [
  {
    id: "coffee",
    eyebrow: "Premium Coffee Program",
    title: "Add Coffee Revenue to Your Vending Route",
    description:
      "A professional single-serve brewer, wide beverage variety, and a supply program designed for workplaces — managed end-to-end by Vending Connector.",
    bullets: [
      "Commercial-grade brewer",
      "Wide beverage variety",
      "Managed supply program",
    ],
    image: { src: "/images/marketing/coffee-service.svg", alt: "Premium single-serve coffee brewer" },
    cta: { label: "Enroll Now", href: "/coffee/apply" },
    icon: Coffee,
  },
  {
    id: "10-10-10",
    eyebrow: "Featured Program",
    title: "Scale Your Vending Business — 10 / 10 / 10",
    description:
      "Ten machines, ten locations, ten-year financing. The Vending Connector program designed to help you go from a starter route to a real vending business, all through one platform.",
    bullets: [
      "10 vending machines",
      "10 qualified locations",
      "10-year financing options",
    ],
    image: { src: "/images/marketing/10-10-10.svg", alt: "10 Machines 10 Locations 10 Year Financing" },
    cta: { label: "Sign Up Today", href: "/signup" },
    icon: TrendingUp,
  },
  {
    id: "financing",
    eyebrow: "Machine Financing",
    title: "Flexible Financing for Your Vending Business",
    description:
      "Long-term financing options — including qualifying 10-year terms — so you can acquire vending equipment without paying the full amount up front.",
    bullets: [
      "Low monthly payments for qualifying operators",
      "Fast application process",
      "Flexible terms built for growth",
    ],
    image: { src: "/images/marketing/financing.svg", alt: "10-year vending machine financing" },
    cta: { label: "Explore Financing", href: "/financing" },
    icon: Banknote,
  },
  {
    id: "ai-vending",
    eyebrow: "AI Vending Solutions",
    title: "Smarter Vending, Powered by AI",
    description:
      "Browse the Vending Connector AI machine lineup — from the VendEra AI Cooler and beyond. AI-powered product recognition, cashless payments, and remote monitoring in every model.",
    bullets: [
      "AI product recognition",
      "Cashless payment systems",
      "Remote inventory monitoring",
    ],
    image: { src: "/images/marketing/ai-vending.svg", alt: "AI-powered vending machines" },
    cta: { label: "Explore AI Vending", href: "/machines-for-sale" },
    icon: Package,
  },
  {
    id: "website-services",
    eyebrow: "Website Services",
    title: "Build Your Vending Business Online",
    description:
      "Custom, mobile-responsive websites built for vending operators. Lead capture, product and service pages, and fast turnaround so your business looks the part.",
    bullets: [
      "Mobile-responsive design",
      "Lead capture forms",
      "Product & service pages",
    ],
    image: { src: "/images/marketing/website-services.svg", alt: "Professional vending business website" },
    cta: { label: "Explore Website Services", href: "/website-services" },
    icon: Globe,
  },
];

// React 19-friendly reduced-motion hook. Uses useSyncExternalStore
// so the initial read happens synchronously without a setState-in-
// effect cycle, and the server-render path returns false (motion
// enabled) deterministically.
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  if (mq.addEventListener) {
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }
  // Legacy Safari fallback.
  mq.addListener(cb);
  return () => mq.removeListener(cb);
}
function getReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
function getReducedMotionServerSnapshot(): boolean {
  return false;
}
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

export default function MarketingGondola() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const touchStartX = useRef<number | null>(null);
  const regionRef = useRef<HTMLElement>(null);
  // Admin-uploaded overrides. When a slot is null we render the
  // shipped placeholder SVG from SLIDES[i].image.src. The API is
  // public so we can fetch on the logged-out homepage too.
  const [overrides, setOverrides] = useState<
    Partial<Record<GondolaSlot, { url: string; uploaded_at: string } | null>>
  >({});
  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketing/gondola", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.images) return;
        setOverrides(json.images);
      })
      .catch(() => { /* placeholders keep rendering — non-fatal */ });
    return () => {
      cancelled = true;
    };
  }, []);

  const slideCount = SLIDES.length;
  const activeSlide = SLIDES[index];

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % slideCount) + slideCount) % slideCount);
    },
    [slideCount],
  );
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Auto-advance timer. Restarts whenever index, pause state, or the
  // reduced-motion preference changes so we never fight the user.
  useEffect(() => {
    if (paused || reducedMotion) return;
    const t = setTimeout(next, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [index, paused, reducedMotion, next]);

  // Keyboard navigation — only when the carousel region has focus.
  useEffect(() => {
    const el = regionRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (!el.contains(document.activeElement)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0) next(); else prev();
  }

  const Icon = activeSlide.icon;

  // Reserve stable dimensions so hydrated content doesn't reflow when
  // the first slide's image finishes loading. Aspect ratio math is
  // hard-coded on the parent to guarantee a fixed hero height.
  const slideKeys = useMemo(() => SLIDES.map((s) => s.id), []);

  return (
    <section
      ref={regionRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Vending Connector featured programs"
      // Green feature background — brand green wash that ties the
      // gondola to the VC palette without swamping body text.
      className="relative w-full overflow-hidden border-b border-green-200 bg-gradient-to-br from-green-50 via-green-100 to-green-50"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 sm:py-10 md:grid-cols-2 md:gap-10 md:py-14 lg:px-8">
        {/* Text column — order-2 on mobile so the image doesn't
            dominate the fold on small screens. */}
        <div
          key={`content-${activeSlide.id}`}
          className="order-2 flex flex-col justify-center animate-fade-in"
          aria-live="polite"
        >
          {/* White pill for the eyebrow — on the green background the
              previous translucent-green pill lost contrast. */}
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-green-primary shadow-sm ring-1 ring-inset ring-green-200">
            <Icon className="h-3.5 w-3.5" />
            {activeSlide.eyebrow}
          </span>
          <h2 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight text-black-primary sm:text-3xl lg:text-4xl">
            {activeSlide.title}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-gray-600 sm:text-base">
            {activeSlide.description}
          </p>
          {activeSlide.bullets && activeSlide.bullets.length > 0 && (
            <ul className="mt-5 space-y-2 text-sm text-gray-700">
              {activeSlide.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-primary" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={activeSlide.cta.href}
              className="inline-flex items-center gap-2 rounded-lg bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-hover hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-primary"
            >
              {activeSlide.cta.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-xs text-gray-400">
              {index + 1} / {slideCount}
            </span>
          </div>
        </div>

        {/* Image column — fixed aspect ratio keeps hero height stable
            across slides. next/image with priority on the first slide
            only; the rest lazy load. */}
        <div className="order-1 md:order-2">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:aspect-[4/5]">
            {SLIDES.map((s, i) => {
              // Prefer the admin-uploaded override when present; fall
              // back to the shipped placeholder SVG. Uploaded URLs
              // point at Supabase Storage — bypass next/image
              // optimization for them (unoptimized) so the ?v=<epoch>
              // cache-buster reaches the browser unmangled.
              const override = overrides[s.id as GondolaSlot];
              const src = override?.url ?? s.image.src;
              const isRemote = !!override;
              // Key includes the src so <Image> hard-remounts when
              // an override arrives or is swapped — otherwise React
              // reuses the same <img> node and the browser's HTTP
              // cache serves the old bitmap.
              return (
                <Image
                  key={`${s.id}:${src}`}
                  src={src}
                  alt={s.image.alt}
                  fill
                  sizes="(min-width: 1024px) 480px, (min-width: 768px) 40vw, 90vw"
                  priority={i === 0}
                  loading={i === 0 ? undefined : "lazy"}
                  unoptimized={isRemote}
                  className={`object-cover transition-opacity duration-500 ${i === index ? "opacity-100" : "opacity-0"}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Prev / Next arrows — visible on md+ where there's room. */}
      <button
        type="button"
        onClick={prev}
        aria-label="Previous slide"
        className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full border border-gray-200 bg-white/90 p-2 text-black-primary shadow-sm backdrop-blur transition-all hover:border-green-primary hover:text-green-primary md:inline-flex"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="Next slide"
        className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full border border-gray-200 bg-white/90 p-2 text-black-primary shadow-sm backdrop-blur transition-all hover:border-green-primary hover:text-green-primary md:inline-flex"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Dot indicators — always visible, mobile-tap friendly. */}
      <div
        role="tablist"
        aria-label="Choose slide"
        className="flex items-center justify-center gap-2 pb-5"
      >
        {slideKeys.map((key, i) => {
          const active = i === index;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`Slide ${i + 1}: ${SLIDES[i].title}`}
              onClick={() => goTo(i)}
              // Inactive dots use a green tone so they read on the
              // green background without disappearing.
              className={`h-2 rounded-full transition-all ${
                active
                  ? "w-8 bg-green-primary"
                  : "w-2 bg-green-primary/30 hover:bg-green-primary/50"
              }`}
            />
          );
        })}
      </div>
    </section>
  );
}
