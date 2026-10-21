import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ImageOff } from "lucide-react";
import { getBrandBySlug, type BrandMachine } from "@/lib/vendingBrands";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return { title: "Brand | Vending Connector" };
  return {
    title: `${brand.name} machines | Vending Connector`,
    description: brand.blurb || `Browse the ${brand.name} smart cooler and vending machine lineup.`,
  };
}

export default async function BrandLineupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  return (
    <main className="bg-light">
      {/* Brand header */}
      <section className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <Link href="/smart-coolers" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-green-primary">
            <ArrowLeft className="h-4 w-4" /> All brands
          </Link>
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            {brand.logoUrl && (
              <div className="relative h-20 w-40 shrink-0">
                <Image src={brand.logoUrl} alt={brand.name} fill unoptimized className="object-contain object-left" />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-black-primary sm:text-4xl">{brand.name}</h1>
              {brand.blurb && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">{brand.blurb}</p>}
            </div>
          </div>
        </div>
      </section>

      {/* Lineup */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <h2 className="mb-8 text-2xl font-bold text-black-primary">The {brand.name} lineup</h2>
        {brand.machines.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <p className="text-sm font-medium text-gray-500">Lineup coming soon.</p>
            <p className="mt-1 text-sm text-gray-400">We&apos;re adding {brand.name} machines — check back shortly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {brand.machines.map((m) => (
              <BrandMachineCard key={m.id} machine={m} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function BrandMachineCard({ machine }: { machine: BrandMachine }) {
  return (
    <div className="flex h-full flex-col">
      {machine.imageUrl ? (
        <div className="relative mb-4 h-56 overflow-hidden rounded-xl bg-gray-100">
          <Image src={machine.imageUrl} alt={machine.title} fill unoptimized className="object-contain" />
        </div>
      ) : (
        <div className="mb-4 flex h-56 items-center justify-center rounded-xl bg-gray-200">
          <ImageOff className="h-8 w-8 text-gray-300" />
        </div>
      )}
      <h3 className="mb-2 font-semibold text-black-primary">{machine.title}</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {machine.machineType && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{machine.machineType}</span>
        )}
        {machine.condition && (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">{machine.condition.replace(/_/g, " ")}</span>
        )}
      </div>
      <div className="mt-auto border-t border-gray-100 pt-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Starting at</div>
        <div className="text-xl font-bold text-green-primary">{machine.priceLabel}</div>
      </div>
    </div>
  );
}
