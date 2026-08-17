import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Globe,
  Sparkles,
  Search,
  Handshake,
  ShieldCheck,
  Zap,
} from "lucide-react";

/**
 * Public marketing landing for Website Services. The actual intake
 * wizard at /website-builder is auth-gated, which broke the homepage
 * CTA before this page existed. Now the marketing CTA lands here
 * (public), and this page's "Start My Website" button funnels
 * through signup into the wizard.
 */

export const metadata: Metadata = {
  title: "Website Services | Vending Connector",
  description:
    "Professional vending websites designed to build credibility, showcase your route, and generate real opportunities. Guided intake, tailored to your business.",
  alternates: { canonical: "/website-services" },
};

const BENEFITS = [
  {
    icon: Sparkles,
    title: "Purpose-built for vending",
    description: "Every layout, page, and section reflects how vending operators actually sell their service.",
  },
  {
    icon: ShieldCheck,
    title: "Credibility that closes",
    description: "A professional site tells location owners you're a real operator worth signing with.",
  },
  {
    icon: Search,
    title: "Findable in search",
    description: "Clean structure and metadata so prospects can find you when they're looking for vending.",
  },
  {
    icon: Zap,
    title: "Guided intake, no rebuilds",
    description: "Answer a short wizard about your business — our team handles the design and setup.",
  },
];

const STEPS = [
  {
    n: 1,
    title: "Tell us about your business",
    description: "Complete the guided intake — logo, colors, services, service area and the story of your route.",
  },
  {
    n: 2,
    title: "We design and build",
    description: "Our team turns your intake into a polished vending website with the pages that matter.",
  },
  {
    n: 3,
    title: "Launch and grow",
    description: "Your site goes live so location owners, brokers and partners can find you and reach out.",
  },
];

export default function WebsiteServicesPage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative bg-gradient-to-b from-light to-light-warm">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-green-100/60 blur-[120px]" />
        <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-24 lg:px-8">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-green-primary">
            Website Services
          </p>
          <h1 className="mx-auto max-w-3xl text-center text-3xl font-extrabold leading-tight tracking-tight text-black-primary sm:text-4xl lg:text-5xl">
            A professional website for your{" "}
            <span className="text-green-primary">vending business</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-gray-600 sm:text-base">
            Build credibility, showcase your route, and generate real opportunities with a website designed specifically for modern vending operators.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/website-builder"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-hover hover:shadow-md"
            >
              Start My Website
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-primary/40 bg-white px-6 py-3 text-sm font-semibold text-green-primary transition-all hover:border-green-primary hover:bg-green-50"
            >
              Create an Account First
            </Link>
          </div>
          <p className="mt-3 text-center text-xs text-gray-500">
            You&apos;ll be asked to sign in before the guided intake — an account keeps your progress and lets our team follow up.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-black-primary sm:text-3xl">
              Why operators choose Vending Connector for their website
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-primary">
                  <b.icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-black-primary">{b.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                    {b.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-light-warm py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-black-primary sm:text-3xl">
              How it works
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-green-primary text-xs font-bold text-white shadow">
                  {s.n}
                </div>
                <Handshake className="mb-3 h-5 w-5 text-green-primary" strokeWidth={2} />
                <h3 className="text-base font-semibold text-black-primary">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <Globe className="mx-auto mb-4 h-10 w-10 text-green-primary" strokeWidth={1.5} />
          <h2 className="text-2xl font-bold text-black-primary sm:text-3xl">
            Ready to give your vending business a real online presence?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600 sm:text-base">
            The guided intake takes about ten minutes. Our team handles the rest.
          </p>
          <div className="mt-6">
            <Link
              href="/website-builder"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-hover hover:shadow-md"
            >
              Start My Website
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
