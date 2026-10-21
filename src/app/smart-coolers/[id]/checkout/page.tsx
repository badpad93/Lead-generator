import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSellableMachine } from "@/lib/smartCoolerMachines";
import CheckoutForm from "./CheckoutForm";

export const metadata: Metadata = {
  title: "Checkout | Vending Connector",
};

function formatPrice(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

export default async function SmartCoolerCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const machine = await getSellableMachine(id);
  if (!machine) notFound();

  return (
    <main className="bg-light">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <Link href="/smart-coolers" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-green-primary">
          <ArrowLeft className="h-4 w-4" /> Back to machines
        </Link>

        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          {machine.imageUrl ? (
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
              <Image src={machine.imageUrl} alt={machine.name} fill unoptimized className="object-contain" />
            </div>
          ) : (
            <div className="h-20 w-20 shrink-0 rounded-xl bg-gray-200" />
          )}
          <div>
            <h1 className="text-lg font-bold text-black-primary">{machine.name}</h1>
            <p className="text-sm text-gray-500">Price</p>
            <p className="text-2xl font-bold text-green-primary">{formatPrice(machine.priceCents)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="mb-1 text-base font-bold text-black-primary">Your details</h2>
          <p className="mb-5 text-sm text-gray-500">
            We&apos;ll email you a secure invoice to complete payment.
          </p>
          <CheckoutForm machineId={machine.id} />
        </div>
      </div>
    </main>
  );
}
