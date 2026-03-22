"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  MapPin,
  ShoppingBag,
  Clock,
  ArrowRight,
  Search,
} from "lucide-react";
import type { MachineType } from "@/lib/types";
import MachineTypeBadge from "@/app/components/MachineTypeBadge";

interface PurchasedLead {
  id: string;
  request_id: string;
  amount_cents: number;
  created_at: string;
  vending_requests: {
    id: string;
    title: string;
    city: string;
    state: string;
    machine_types_wanted: MachineType[];
    location_type: string;
  } | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function YourLeadsPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<PurchasedLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPurchases() {
      try {
        const res = await fetch("/api/user/purchases");

        if (res.status === 401) {
          router.push("/login?redirect=/your-leads");
          return;
        }

        if (res.ok) {
          const data = await res.json();
          setPurchases(data.purchases ?? []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }

    fetchPurchases();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-160px)] bg-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="skeleton h-8 w-48 mb-2" />
          <div className="skeleton h-5 w-64 mb-8" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="skeleton mb-3 h-5 w-3/4" />
                <div className="skeleton mb-2 h-4 w-1/2" />
                <div className="flex gap-2 mt-3">
                  <div className="skeleton h-5 w-16 rounded-full" />
                  <div className="skeleton h-5 w-16 rounded-full" />
                </div>
                <div className="skeleton mt-4 h-4 w-1/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50">
              <ShoppingBag className="h-6 w-6 text-green-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-black-primary">
                Your Leads
              </h1>
              <p className="mt-1 text-sm text-black-primary/50">
                All leads you have purchased
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {purchases.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 px-6 py-16 text-center">
            <ShoppingBag className="mb-4 h-12 w-12 text-black-primary/20" />
            <h2 className="text-lg font-semibold text-black-primary">
              You haven&apos;t purchased any leads yet.
            </h2>
            <p className="mt-2 text-sm text-black-primary/50 max-w-md">
              Browse available requests and purchase leads to unlock full
              location details and contact information.
            </p>
            <Link
              href="/browse-requests"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
            >
              <Search className="h-4 w-4" />
              Browse Requests
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {purchases.map((purchase) => {
              const lead = purchase.vending_requests;
              if (!lead) return null;

              return (
                <div
                  key={purchase.id}
                  className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-green-100 hover:shadow-md"
                >
                  {/* Title */}
                  <h3 className="font-semibold text-black-primary text-sm leading-snug line-clamp-2 group-hover:text-green-primary transition-colors">
                    {lead.title}
                  </h3>

                  {/* Location */}
                  <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-500">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>
                      {lead.city}, {lead.state}
                    </span>
                  </div>

                  {/* Machine types */}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {lead.machine_types_wanted.slice(0, 3).map((mt) => (
                      <MachineTypeBadge key={mt} type={mt} size="sm" />
                    ))}
                    {lead.machine_types_wanted.length > 3 && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        +{lead.machine_types_wanted.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Purchase date */}
                  <div className="flex items-center gap-1 mt-3 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    Purchased {formatDate(purchase.created_at)}
                  </div>

                  {/* View Lead button */}
                  <Link
                    href={`/requests/${lead.id}`}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100"
                  >
                    View Lead
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
