import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { getSellableLocator } from "@/lib/locationServices";
import CheckoutForm from "./CheckoutForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hire a Locator | Vending Connector" };

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

export default async function LocatorCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locator = await getSellableLocator(id);
  if (!locator) notFound();

  return (
    <main className="bg-light">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <Link href="/locators" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-green-primary">
          <ArrowLeft className="h-4 w-4" /> All locators
        </Link>

        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          {locator.headshotUrl ? (
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
              <Image src={locator.headshotUrl} alt={locator.name} fill unoptimized className="object-cover" />
            </div>
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-green-50 text-2xl font-bold text-green-primary/50">
              {locator.name.slice(0, 1)}
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-black-primary">{locator.name}</h1>
            {locator.headline && <p className="text-sm font-medium text-green-primary">{locator.headline}</p>}
            {locator.region && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3.5 w-3.5" /> {locator.region}
              </p>
            )}
            <p className="mt-1 text-sm text-gray-500">{money(locator.hourlyRateCents)}/hr</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <CheckoutForm locatorId={locator.id} locatorName={locator.name} hourlyRateCents={locator.hourlyRateCents} />
        </div>
      </div>
    </main>
  );
}
