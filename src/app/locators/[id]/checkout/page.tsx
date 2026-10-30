import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Users } from "lucide-react";
import { getSellableLocator, getLowestLocatorRateCents, type SellableLocator } from "@/lib/locationServices";
import CheckoutForm from "./CheckoutForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Request Location Services | Vending Connector" };

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

interface Target { id: string; name: string; headline: string; region: string; headshotUrl: string | null; hourlyRateCents: number }

async function resolveTarget(id: string): Promise<Target | null> {
  if (id === "any") {
    const cents = await getLowestLocatorRateCents();
    if (!cents) return null;
    return { id: "any", name: "Any available locator", headline: "We'll assign a specialist", region: "", headshotUrl: null, hourlyRateCents: cents };
  }
  const loc: SellableLocator | null = await getSellableLocator(id);
  if (!loc) return null;
  return { id: loc.id, name: loc.name, headline: loc.headline, region: loc.region, headshotUrl: loc.headshotUrl, hourlyRateCents: loc.hourlyRateCents };
}

export default async function LocatorCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = await resolveTarget(id);
  if (!target) notFound();

  return (
    <main className="bg-light">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <Link href="/locators" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-green-primary">
          <ArrowLeft className="h-4 w-4" /> All locators
        </Link>

        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          {target.headshotUrl ? (
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
              <Image src={target.headshotUrl} alt={target.name} fill unoptimized className="object-cover" />
            </div>
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-primary/60">
              {target.id === "any" ? <Users className="h-8 w-8" /> : <span className="text-2xl font-bold">{target.name.slice(0, 1)}</span>}
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-black-primary">{target.name}</h1>
            {target.headline && <p className="text-sm font-medium text-green-primary">{target.headline}</p>}
            {target.region && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3.5 w-3.5" /> {target.region}
              </p>
            )}
            <p className="mt-1 text-sm text-gray-500">{money(target.hourlyRateCents)}/hr</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <CheckoutForm locatorId={target.id} locatorName={target.name} hourlyRateCents={target.hourlyRateCents} />
        </div>
      </div>
    </main>
  );
}
