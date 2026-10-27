import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { MapPin, ArrowRight, Phone, Clock } from "lucide-react";
import { getPublicLocators, HOURS_MIN, type PublicLocator } from "@/lib/locationServices";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hire a Locator | Vending Connector",
  description:
    "Book a dedicated locator to secure placements for your machines. Choose your specialist and the hours per week — billed weekly, cancel anytime.",
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
            Hire {locator.name.split(" ")[0]} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function LocatorsPage() {
  const locators = await getPublicLocators();
  return (
    <main className="bg-light">
      <section className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-wider text-green-primary">Location Services</p>
          <h1 className="mt-2 text-3xl font-bold text-black-primary sm:text-5xl">Hire a dedicated locator</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-500">
            Put a placement specialist to work securing locations for your machines. Choose your locator and how many
            hours a week you want them on it — billed weekly, up front, cancel anytime.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-gray-500">
            <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-green-primary" /> They call you to get started</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-green-primary" /> From {HOURS_MIN} hrs/week, in 5-hour steps</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        {locators.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <p className="text-sm font-medium text-gray-500">Locators coming soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {locators.map((l) => (
              <LocatorCard key={l.id} locator={l} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
