import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { MapPin, ArrowRight, Phone, Clock, Users, PhoneCall, ShieldAlert } from "lucide-react";
import { getPublicLocators, getLowestLocatorRateCents, HOURS_MIN, type PublicLocator } from "@/lib/locationServices";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Request Location Services | Vending Connector",
  description:
    "Choose a locator (or any available specialist), tell us your location needs, and we'll start securing placements for your machines. Charged by the hour, billed weekly.",
};

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

function LocatorCard({ locator }: { locator: PublicLocator }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-all hover:-translate-y-1 hover:shadow-xl hover:ring-green-primary/25">
      <div className="relative h-56 overflow-hidden bg-gray-100">
        {locator.headshotUrl ? (
          <Image src={locator.headshotUrl} alt={locator.name} fill unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 text-4xl font-bold text-green-primary/40">
            {locator.name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold text-black-primary">{locator.name}</h3>
        {locator.headline && <p className="text-sm font-medium text-green-primary">{locator.headline}</p>}
        {locator.region && (
          <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="h-3.5 w-3.5" /> {locator.region}
          </p>
        )}
        {locator.bio && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-500">{locator.bio}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-gray-100 pt-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Rate</div>
            <div className="text-xl font-bold text-green-primary">
              {money(locator.hourlyRateCents)}<span className="text-sm font-medium text-gray-400">/hr</span>
            </div>
          </div>
          <Link
            href={`/locators/${locator.id}/checkout`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-hover"
          >
            Request {locator.name.split(" ")[0]} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const points = [
    { icon: PhoneCall, text: "Your locator makes roughly 100–150 calls a day to targeted businesses in your area." },
    { icon: Clock, text: "Location services are charged by the hour — you choose the hours per week, billed weekly." },
    { icon: ShieldAlert, text: "Locations are not guaranteed; the fee pays for the dedicated outreach, not a specific result." },
  ];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black-primary">How location services work</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {points.map((p) => (
          <li key={p.text} className="flex items-start gap-2.5 text-sm text-gray-600">
            <p.icon className="mt-0.5 h-4 w-4 shrink-0 text-green-primary" />
            <span>{p.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnyLocatorCard({ rateCents }: { rateCents: number }) {
  return (
    <Link href="/locators/any/checkout"
      className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-green-primary/30 bg-green-50/40 p-6 text-center transition-all hover:-translate-y-1 hover:border-green-primary/50 hover:shadow-md">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-primary"><Users className="h-8 w-8" /></span>
      <h3 className="text-lg font-bold text-black-primary">Any available locator</h3>
      <p className="text-sm text-gray-500">No preference — we&apos;ll assign a specialist and get started fast.</p>
      <span className="text-sm font-bold text-green-primary">from {money(rateCents)}/hr</span>
      <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-green-primary">Request now <ArrowRight className="h-4 w-4" /></span>
    </Link>
  );
}

export default async function LocatorsPage() {
  const [locators, anyRate] = await Promise.all([getPublicLocators(), getLowestLocatorRateCents()]);
  return (
    <main className="bg-light">
      <section className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-wider text-green-primary">Location Services</p>
          <h1 className="mt-2 text-3xl font-bold text-black-primary sm:text-5xl">Request location services</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-500">
            Pick a locator — or any available specialist — tell us your location needs, and they&apos;ll get to work
            securing placements for your machines.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-gray-500">
            <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-green-primary" /> A locator reaches out within 24 hours</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-green-primary" /> From {HOURS_MIN} hrs/week, in 5-hour steps</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-10 px-4 py-12 sm:py-16">
        <HowItWorks />
        {locators.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <p className="text-sm font-medium text-gray-500">Locators coming soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {anyRate != null && <AnyLocatorCard rateCents={anyRate} />}
            {locators.map((l) => (
              <LocatorCard key={l.id} locator={l} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
