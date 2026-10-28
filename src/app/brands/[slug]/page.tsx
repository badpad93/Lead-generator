import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ShoppingCart, FileText, Boxes, Layers, Camera, ShieldCheck } from "lucide-react";
import { getBrandBySlug } from "@/lib/vendingBrands";
import { buyHref, type SmartCoolerMachine } from "@/lib/smartCoolerMachines";
import MachinePurchaseBanner from "@/app/components/MachinePurchaseBanner";

// Render per request so brand/lineup/price edits in the admin panel appear
// immediately rather than being frozen into the build-time HTML.
export const dynamic = "force-dynamic";

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
        <MachinePurchaseBanner className="mb-8" />
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

function Spec({ icon: Icon, text }: { icon: typeof Boxes; text: string }) {
  if (!text) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-600">
      <Icon className="h-3.5 w-3.5 text-gray-400" />
      <span>{text}</span>
    </div>
  );
}

function BrandMachineCard({ machine }: { machine: SmartCoolerMachine }) {
  const href = buyHref(machine);
  return (
    <div className="flex h-full flex-col">
      {machine.imageUrl ? (
        <div className="relative mb-4 h-56 overflow-hidden rounded-xl bg-gray-100">
          <Image src={machine.imageUrl} alt={machine.name} fill unoptimized className="object-contain" />
        </div>
      ) : (
        <div className="mb-4 h-56 rounded-xl bg-gray-200" />
      )}
      <h3 className="mb-3 font-semibold text-black-primary">{machine.name}</h3>
      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2">
        <Spec icon={Boxes} text={machine.bottles} />
        <Spec icon={Layers} text={machine.shelves} />
        <Spec icon={Camera} text={machine.cameras} />
        <Spec icon={ShieldCheck} text={machine.warranty} />
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-gray-100 pt-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Starting at</div>
          <div className="text-xl font-bold text-green-primary">{machine.startingAt}</div>
        </div>
        {machine.specUrl && (
          <a href={machine.specUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-green-primary hover:text-green-primary">
            <FileText className="h-4 w-4" /> See specs
          </a>
        )}
      </div>
      {href && (
        <Link href={href}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-hover">
          <ShoppingCart className="h-4 w-4" /> Buy now
        </Link>
      )}
    </div>
  );
}
