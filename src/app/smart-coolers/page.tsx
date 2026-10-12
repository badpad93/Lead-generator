import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/app/components/Reveal";
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
  ImageOff,
} from "lucide-react";

export const metadata: Metadata = {
  title: "AI-Powered Smart Coolers | Vending Connector",
  description:
    "Revolutionary AI-powered vending machines and smart coolers. Tap, grab, and go — autonomous retail that turns any space into a 24/7 store.",
};

/* ------------------------------------------------------------------ *
 * PLACEHOLDER CONTENT — replace before launch.
 * Stats, steps, and the machine grid below are curated placeholders.
 * Swap the copy, prices, specs, and drop real images where marked.
 * ------------------------------------------------------------------ */

const STATS: { value: string; label: string }[] = [
  { value: "1,500+", label: "Deployed Units" },
  { value: "99%", label: "Product Recognition" },
  { value: "24/7", label: "Customer Support" },
];

const STEPS: { icon: typeof CreditCard; title: string; body: string }[] = [
  {
    icon: CreditCard,
    title: "Tap card or phone",
    body: "Tap any credit, debit card, or phone on the reader. The door unlocks instantly.",
  },
  {
    icon: Hand,
    title: "Grab your items",
    body: "Take whatever you want. AI cameras track every item in real time.",
  },
  {
    icon: DoorClosed,
    title: "Close door & go",
    body: "Close the door & walk away. Your card is automatically charged for only what you took.",
  },
];

interface MachinePlaceholder {
  name: string;
  bottles: string;
  shelves: string;
  cameras: string;
  warranty: string;
  startingAt: string;
  /** Drop a real image path here (e.g. "/images/machines/xyz.png"); null renders a placeholder. */
  image: string | null;
}

const MACHINES: MachinePlaceholder[] = [
  { name: "Micromart Fridge Smart Store", bottles: "378 bottles", shelves: "5 shelves", cameras: "4x cameras", warranty: "3/5 year warranty", startingAt: "$6,295", image: null },
  { name: "Summit Pro 542 AI Smart Cooler", bottles: "378 bottles", shelves: "6 shelves", cameras: "2x cameras", warranty: "1 year warranty", startingAt: "$4,699", image: null },
  { name: "Summit Plus 440 AI Smart Cooler", bottles: "324 bottles", shelves: "6 shelves", cameras: "2x cameras", warranty: "1 year warranty", startingAt: "$3,850", image: null },
  { name: "Vantage Elite Smart Cooler", bottles: "450 bottles", shelves: "6 shelves", cameras: "2x cameras", warranty: "1 year warranty", startingAt: "$5,999", image: null },
  { name: "Vantage Prime Smart Cooler", bottles: "360 bottles", shelves: "5 shelves", cameras: "2x cameras", warranty: "1 year warranty", startingAt: "$4,999", image: null },
  { name: "Corner Core AI Smart Cooler", bottles: "300+ bottles", shelves: "6 shelves", cameras: "3x cameras", warranty: "2/5 year warranty", startingAt: "$3,995", image: null },
  { name: "Summit Ultra 1200 AI Smart Cooler", bottles: "756 bottles", shelves: "12 shelves", cameras: "4x cameras", warranty: "1 year warranty", startingAt: "$7,199", image: null },
  { name: "Summit Mini 360 AI Smart Cooler", bottles: "252 bottles", shelves: "6 shelves", cameras: "2x cameras", warranty: "1 year warranty", startingAt: "$3,449", image: null },
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
        {/* Image placeholder — replace with a real photo of the step. */}
        <div className="flex h-48 items-center justify-center bg-gradient-to-br from-gray-800 to-gray-950">
          <ImageOff className="h-8 w-8 text-white/25" />
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

function MachineCard({ machine, delay }: { machine: MachinePlaceholder; delay: number }) {
  return (
    <Reveal delay={delay} className="h-full">
      <div className="flex h-full flex-col">
        {/* Image placeholder — set machine.image to a real path to replace. */}
        <div className="mb-4 flex h-56 items-center justify-center rounded-xl bg-gray-100">
          <ImageOff className="h-8 w-8 text-gray-300" />
        </div>
        <h3 className="mb-3 font-semibold text-black-primary">{machine.name}</h3>
        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2">
          <SpecRow icon={Boxes} text={machine.bottles} />
          <SpecRow icon={Layers} text={machine.shelves} />
          <SpecRow icon={Camera} text={machine.cameras} />
          <SpecRow icon={ShieldCheck} text={machine.warranty} />
        </div>
        <div className="mt-auto border-t border-gray-100 pt-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Starting at</div>
          <div className="text-xl font-bold text-green-primary">{machine.startingAt}</div>
        </div>
      </div>
    </Reveal>
  );
}

export default function SmartCoolersPage() {
  return (
    <main className="bg-light">
      {/* ===== Hero — live background video + dark overlay ===== */}
      <section className="relative overflow-hidden bg-black-primary">
        {/* Background video. Drop the real asset at /public/videos/smart-coolers-hero.mp4
            (and a poster frame at /public/videos/smart-coolers-hero-poster.jpg).
            Until then the gradient below shows through. */}
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
              AI-Powered Innovation
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight text-white sm:text-6xl">
              <span className="bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
                AI-Powered
              </span>{" "}
              Smart Coolers
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
              Revolutionary AI-powered vending machines with customizable wraps. Transform your space
              with cutting-edge technology and stunning designs.
            </p>
            <Link
              href="/machines-for-sale"
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

      {/* ===== Collection intro ===== */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-wider text-green-primary">Shop by collection</p>
          <div className="mt-2 grid gap-6 md:grid-cols-2 md:items-end">
            <h2 className="text-3xl font-bold text-black-primary sm:text-4xl">
              A machine for <span className="text-green-primary">everyone</span>
            </h2>
            <p className="text-sm leading-relaxed text-gray-500">
              Carefully selected machines, each with a clear role. Start with the collection that best
              matches your location, budget, and operating goals.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ===== How AI vending works ===== */}
      <section className="bg-black-primary py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-wider text-green-400">How AI vending works</p>
            <div className="mt-3 grid gap-6 md:grid-cols-2 md:items-start">
              <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
                No spiral racks.<br />No checkout line.
              </h2>
              <p className="text-sm leading-relaxed text-white/60">
                AI-powered coolers turn a familiar refrigerator into an autonomous store. Customers shop
                naturally while cameras and software handle the transaction behind the scenes.
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

      {/* ===== Popular machines ===== */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <Reveal>
          <h2 className="text-3xl font-bold text-black-primary sm:text-4xl">Some of our most popular machines</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-500">
            Every brand &amp; machine we sell is thoroughly vetted by our team. We only sell a machine if
            it&apos;s something we&apos;d buy &amp; operate ourselves.
          </p>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {MACHINES.map((m, i) => (
            <MachineCard key={m.name} machine={m} delay={(i % 4) * 80} />
          ))}
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section className="bg-black-primary py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <Reveal>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Ready to put a smart cooler to work?</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/60">
              Join the operators growing with AI-powered vending. Get started in minutes — no spiral racks,
              no checkout line, no guesswork.
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
