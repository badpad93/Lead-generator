"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Package, Zap } from "lucide-react";
import type { Machine } from "@/lib/machineTypes";
import { formatCents } from "@/lib/machineTypes";

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/machines")
      .then((r) => r.json())
      .then((d) => setMachines(d.machines || []))
      .catch(() => setMachines([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50">
              <Package className="h-6 w-6 text-green-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-black-primary">
                Machine Marketplace
              </h1>
              <p className="text-sm text-black-primary/60">
                Buy vending machines from Apex AI Vending — cash, financing, or bundled with location services.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-green-primary" />
          </div>
        ) : machines.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <p className="text-black-primary/60">No machines available right now. Check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {machines.map((m) => (
              <MachineCard key={m.id} machine={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MachineCard({ machine }: { machine: Machine }) {
  return (
    <Link
      href={`/machines/${machine.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full bg-gradient-to-br from-green-50 to-light-warm">
        {machine.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={machine.image_url}
            alt={machine.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-green-primary/40">
            <Package className="h-16 w-16" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold text-black-primary">{machine.name}</h3>
        {machine.short_description && (
          <p className="mt-1 text-sm text-black-primary/60 line-clamp-2">
            {machine.short_description}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
          <div>
            <p className="text-xs text-black-primary/50">Starting at</p>
            <p className="text-lg font-bold text-black-primary">
              {formatCents(machine.price_cents)}
            </p>
            {machine.finance_estimate_monthly_cents && (
              <p className="text-xs text-green-primary">
                or ~{formatCents(machine.finance_estimate_monthly_cents)}/mo financed
              </p>
            )}
          </div>
          <span className="inline-flex items-center gap-1 rounded-xl bg-green-primary px-3 py-2 text-xs font-semibold text-white transition-colors group-hover:bg-green-hover">
            Build Package
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
        {machine.features && machine.features.length > 0 && (
          <ul className="mt-4 space-y-1">
            {machine.features.slice(0, 3).map((f) => (
              <li
                key={f}
                className="flex items-start gap-1.5 text-xs text-black-primary/70"
              >
                <Zap className="mt-0.5 h-3 w-3 flex-shrink-0 text-green-primary" />
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}
