import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Reveal from "@/app/components/Reveal";
import { getSmartCoolerMachines, type SmartCoolerMachine } from "@/lib/smartCoolerMachines";
import { getPublicBrands, getBrandShowcase, type VendingBrand, type BrandShowcaseItem } from "@/lib/vendingBrands";
import {
  ArrowRight,
  Sparkles,
  CreditCard,
  Hand,
  DoorClosed,
  Boxes,
  Layers,
  Camera,
  ShieldCheck,
  FileText,
  ShoppingCart,
} from "lucide-react";

// Render per request so admin edits (new brands, prices, active toggles)
// show up immediately instead of being frozen into the build-time HTML.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Smart Coolers & AI Vending Machines | Vending Connector",
  description:
    "AI-powered smart coolers and vending machines. Customers tap, grab, and go — autonomous retail that runs any space around the clock.",
};

/* ------------------------------------------------------------------ *
 * PLACEHOLDER CONTENT — replace before launch.
 * Stats, steps, and the machine grid below are curated placeholders.
 * Swap the copy, prices, specs, and drop real images where marked.
 * ------------------------------------------------------------------ */

const STATS: { value: string; label: string }[] = [
  { value: "1,500+", label: "Units in the Field" },
  { value: "99%", label: "Recognition Accuracy" },
  { value: "24/7", label: "Support, Always On" },
];

const STEPS: { icon: typeof CreditCard; title: string; body: string }[] = [
  {
    icon: CreditCard,
    title: "Tap to unlock",
    body: "Tap a card or phone on the reader and the door unlocks right away.",
  },
  {
    icon: Hand,
    title: "Grab what you want",
    body: "Pull out any items you like — the cameras track every pick in real time.",
  },
  {
    icon: DoorClosed,
    title: "Shut the door & go",
    body: "Close the door and walk off — you're charged automatically for exactly what you took.",
  },
];

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-green-400 sm:text-3xl">{value}</div>
      <div className="text-xs font-medium text-white/60 sm:text-sm">{label}</div>
    </div>
  );
}

function StepCard({ step, delay }: { step: (typeof STEPS)[number]; delay: number }) {
  const Icon = step.icon;
  return (
    <Reveal delay={delay} className="h-full">
      <div className="h-full overflow-hidden rounded-2xl bg-white shadow-xl shadow-black/20">
        {/* Generic branded graphic — a glowing icon tile on a dark gradient. */}
        <div className="relative flex h-48 items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-black-primary to-gray-950">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-green-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-green-500/10 blur-3xl" />
          <div className="pointer-events-none absolute left-6 top-6 h-16 w-16 rounded-full border border-white/5" />
          <div className="pointer-events-none absolute bottom-6 right-8 h-10 w-10 rounded-full border border-white/5" />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur">
            <Icon className="h-9 w-9 text-green-400" />
          </span>
        </div>
        <div className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-primary">
              <Icon className="h-4 w-4" />
            </span>
            <h3 className="font-semibold text-black-primary">{step.title}</h3>
          </div>
          <p className="text-sm leading-relaxed text-gray-500">{step.body}</p>
        </div>
      </div>
    </Reveal>
  );
}

function SpecRow({ icon: Icon, text }: { icon: typeof Boxes; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-600">
      <Icon className="h-3.5 w-3.5 text-gray-400" />
      <span>{text}</span>
    </div>
  );
}

/** Where a card's Buy button goes: direct smart-cooler checkout, else a linked listing. */
function buyHref(machine: SmartCoolerMachine): string | null {
  if (machine.priceCents != null) return `/smart-coolers/${machine.id}/checkout`;
  if (machine.buyNowEnabled && machine.listingId) return `/machines-for-sale/${machine.listingId}/checkout`;
  return null;
}

function MachineCard({ machine, delay }: { machine: SmartCoolerMachine; delay: number }) {
  const href = buyHref(machine);
  return (
    <Reveal delay={delay} className="h-full">
      <div className="flex h-full flex-col">
        {machine.imageUrl ? (
          <div className="relative mb-4 h-56 overflow-hidden rounded-xl bg-gray-100">
            <Image src={machine.imageUrl} alt={machine.name} fill unoptimized className="object-contain" />
          </div>
        ) : (
          /* Flat grey placeholder until a photo is uploaded in the admin panel. */
          <div className="mb-4 h-56 rounded-xl bg-gray-200" />
        )}
        <h3 className="mb-3 font-semibold text-black-primary">{machine.name}</h3>
        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2">
          <SpecRow icon={Boxes} text={machine.bottles} />
          <SpecRow icon={Layers} text={machine.shelves} />
          <SpecRow icon={Camera} text={machine.cameras} />
          <SpecRow icon={ShieldCheck} text={machine.warranty} />
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-gray-100 pt-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Starting at</div>
            <div className="text-xl font-bold text-green-primary">{machine.startingAt}</div>
          </div>
          {machine.specUrl && (
            <a
              href={machine.specUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-green-primary hover:text-green-primary"
            >
              <FileText className="h-4 w-4" /> See specs
            </a>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-hover"
          >
            <ShoppingCart className="h-4 w-4" /> Buy now
          </Link>
        )}
      </div>
    </Reveal>
  );
}

function BrandCard({ brand, delay }: { brand: VendingBrand; delay: number }) {
  return (
    <Reveal delay={delay} className="h-full">
      <Link
        href={`/brands/${brand.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:ring-green-primary/25"
      >
        {/* Logo on a soft green header + green corner button */}
        <div className="relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br from-green-50 via-white to-emerald-50 p-6">
          {brand.logoUrl ? (
            <div className="relative h-12 w-full">
              <Image src={brand.logoUrl} alt={brand.name} fill unoptimized className="object-contain" />
            </div>
          ) : (
            <span className="text-xl font-bold text-black-primary">{brand.name}</span>
          )}
          <span className="absolute right-3.5 top-3.5 flex h-9 w-9 items-center justify-center rounded-full bg-green-primary text-white shadow-md shadow-green-primary/30 transition-transform duration-200 group-hover:scale-110">
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
        {/* Body */}
        <div className="flex flex-1 flex-col border-t border-gray-100 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-green-primary">{brand.name}</p>
          {brand.blurb && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-500">{brand.blurb}</p>}
          <p className="mt-auto pt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {brand.machineCount} {brand.machineCount === 1 ? "machine" : "machines"}
          </p>
        </div>
      </Link>
    </Reveal>
  );
}

function ShowcaseCard({ item, delay }: { item: BrandShowcaseItem; delay: number }) {
  const { machine, brandSlug, brandName, brandBlurb, brandLogoUrl, machineCount } = item;
  const blurb = brandBlurb || "Refined AI-powered machines, hand-picked for standout placements.";
  return (
    <Reveal delay={delay} className="h-full">
      <Link
        href={`/brands/${brandSlug}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:ring-green-primary/25"
      >
        {/* Image with overlaid brand logo + green corner button */}
        <div className="relative h-52 overflow-hidden bg-gray-50">
          {machine.imageUrl ? (
            <Image src={machine.imageUrl} alt={machine.name} fill unoptimized className="object-contain p-4 transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="h-full w-full bg-gray-200" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black-primary/55 via-transparent to-transparent" />
          <span className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-green-primary text-white shadow-lg shadow-green-primary/30 transition-transform duration-200 group-hover:scale-110">
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
          <div className="absolute bottom-4 left-5 right-5">
            {brandLogoUrl ? (
              <div className="relative h-8 w-36">
                <Image src={brandLogoUrl} alt={brandName} fill unoptimized className="object-contain object-left drop-shadow" />
              </div>
            ) : (
              <span className="text-xl font-bold text-white drop-shadow">{brandName}</span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-green-primary">{brandName}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">{blurb}</p>
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">In the lineup</p>
            <p className="mt-0.5 text-sm font-bold text-black-primary">
              {machineCount} {machineCount === 1 ? "model" : "models"} — {machine.name}
              {machineCount > 1 ? " & more" : ""}
            </p>
          </div>
        </div>
      </Link>
    </Reveal>
  );
}

export default async function SmartCoolersPage() {
  const machines = await getSmartCoolerMachines();
  const brands = await getPublicBrands();
  const showcase = await getBrandShowcase();
  return (
    <main className="bg-light">
      {/* ===== Hero — live background video + dark overlay ===== */}
      <section className="relative overflow-hidden bg-black-primary">
        {/* Background video (muted, looping). The gradient shows through while
            the video loads or if it can't play. */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black-primary to-gray-950" />
          <video
            className="h-full w-full object-cover opacity-70"
            autoPlay
            muted
            loop
            playsInline
            poster="/videos/smart-coolers-hero-poster.jpg"
          >
            <source src="/videos/smart-coolers-hero.webm" type="video/webm" />
            <source src="/videos/smart-coolers-hero.mp4" type="video/mp4" />
          </video>
          {/* Legibility overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black-primary/90 via-black-primary/60 to-black-primary/30" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:py-32">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-green-400" />
              Autonomous Retail
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight text-white sm:text-6xl">
              <span className="bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
                Autonomous
              </span>{" "}
              Smart Coolers
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
              Smart, camera-powered coolers with fully customizable wraps. Turn any space into a modern
              self-service store that sells around the clock.
            </p>
            <Link
              href="#brands"
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-green-primary/20 transition-all hover:bg-green-hover hover:shadow-green-primary/30"
            >
              Shop All Machines
              <ArrowRight className="h-4 w-4" />
            </Link>

            <div className="mt-12 border-t border-white/10 pt-6">
              <div className="flex flex-wrap gap-x-12 gap-y-4">
                {STATS.map((s) => (
                  <HeroStat key={s.label} value={s.value} label={s.label} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Featured machines — one per brand, links to the brand lineup ===== */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <Reveal>
          <h2 className="text-3xl font-bold text-black-primary sm:text-4xl">Machines our operators love</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-500">
            A favorite from each brand we carry. Tap any machine to explore that brand&apos;s full lineup.
          </p>
        </Reveal>
        {showcase.length > 0 ? (
          <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {showcase.map((item, i) => (
              <ShowcaseCard key={item.brandSlug} item={item} delay={(i % 3) * 80} />
            ))}
          </div>
        ) : (
          /* No brands set up yet — fall back to the full machine grid. */
          <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {machines.map((m, i) => (
              <MachineCard key={m.id} machine={m} delay={(i % 4) * 80} />
            ))}
          </div>
        )}
      </section>

      {/* ===== AI Vending Brands ===== */}
      {brands.length > 0 && (
        <section id="brands" className="scroll-mt-20 bg-light-warm py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-wider text-green-primary">Shop by brand</p>
              <h2 className="mt-2 text-3xl font-bold text-black-primary sm:text-4xl">AI vending brands</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-500">
                Explore the brands we carry. Pick a brand to see its full machine lineup.
              </p>
            </Reveal>
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {brands.map((b, i) => (
                <BrandCard key={b.id} brand={b} delay={(i % 3) * 80} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== Collection intro ===== */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-wider text-green-primary">Browse the lineup</p>
          <div className="mt-2 grid gap-6 md:grid-cols-2 md:items-end">
            <h2 className="text-3xl font-bold text-black-primary sm:text-4xl">
              A cooler for <span className="text-green-primary">every space</span>
            </h2>
            <p className="text-sm leading-relaxed text-gray-500">
              Every model is hand-picked for a specific job. Start with the one that fits your location,
              budget, and the way you operate.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ===== How AI vending works ===== */}
      <section className="bg-black-primary py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-wider text-green-400">How it works</p>
            <div className="mt-3 grid gap-6 md:grid-cols-2 md:items-start">
              <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
                No coils.<br />No register.
              </h2>
              <p className="text-sm leading-relaxed text-white/60">
                These coolers look like an ordinary fridge but run like a self-checkout store. Shoppers
                grab what they want while cameras and software ring it up automatically.
              </p>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <StepCard key={step.title} step={step} delay={i * 100} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section className="bg-black-primary py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <Reveal>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Ready to drop a smart cooler in your space?</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/60">
              Join the operators scaling with autonomous vending. Set up in minutes — no coils, no
              register, no guesswork.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-hover hover:shadow-md"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
