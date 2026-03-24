"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  DollarSign,
  Cpu,
  Building2,
  Clock,
  Loader2,
  AlertCircle,
  Mail,
  Package,
  FileText,
  TrendingUp,
} from "lucide-react";
import type { RouteListing } from "@/lib/types";
import { MACHINE_TYPES, LOCATION_TYPES } from "@/lib/types";
import MachineTypeBadge from "../../components/MachineTypeBadge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  const months = Math.floor(diffDays / 30);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

function formatCurrency(val: number | null): string {
  if (val == null) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
}

function getStatusConfig(status: string) {
  switch (status) {
    case "active":
      return { bg: "bg-green-50", text: "text-green-700", ring: "ring-green-200", label: "Active" };
    case "sold":
      return { bg: "bg-slate-50", text: "text-slate-600", ring: "ring-slate-200", label: "Sold" };
    case "pending":
      return { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", label: "Pending" };
    default:
      return { bg: "bg-gray-50", text: "text-gray-600", ring: "ring-gray-200", label: status };
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="min-h-screen bg-light">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="skeleton h-4 w-32 mb-8" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start gap-4">
                <div className="skeleton h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-3">
                  <div className="skeleton h-6 w-3/4" />
                  <div className="skeleton h-5 w-20 rounded-full" />
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-2/3" />
              </div>
              <div className="mt-6 flex gap-2">
                <div className="skeleton h-6 w-16 rounded-full" />
                <div className="skeleton h-6 w-20 rounded-full" />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="skeleton h-16 rounded-lg" />
                <div className="skeleton h-16 rounded-lg" />
                <div className="skeleton h-16 rounded-lg" />
                <div className="skeleton h-16 rounded-lg" />
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="skeleton h-5 w-48 mb-4" />
              <div className="skeleton h-10 w-full rounded-lg mb-3" />
              <div className="skeleton h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SimilarRouteCard({ route }: { route: RouteListing }) {
  return (
    <Link
      href={`/routes-for-sale/${route.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 transition-shadow hover:shadow-lg hover:shadow-green-primary/5 group"
    >
      <h4 className="font-semibold text-black-primary text-sm leading-snug truncate group-hover:text-green-primary transition-colors">
        {route.title}
      </h4>
      {route.city && route.state && (
        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{route.city}, {route.state}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="rounded-md bg-green-50 px-2 py-1">
          <p className="text-[10px] text-gray-500 font-medium">Price</p>
          <p className="text-xs font-bold text-green-700">{formatCurrency(route.asking_price)}</p>
        </div>
        <div className="rounded-md bg-gray-50 px-2 py-1">
          <p className="text-[10px] text-gray-500 font-medium">Revenue</p>
          <p className="text-xs font-bold text-black-primary">{formatCurrency(route.monthly_revenue)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
        <div className="flex flex-wrap gap-1">
          {route.machine_types.slice(0, 2).map((mt) => (
            <MachineTypeBadge key={mt} type={mt} size="sm" />
          ))}
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-primary">
          View
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function RouteDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [route, setRoute] = useState<RouteListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [similarRoutes, setSimilarRoutes] = useState<RouteListing[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  const fetchRoute = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/routes/${id}`);
      if (!res.ok) {
        setError(res.status === 404 ? "Route not found" : "Failed to load route");
        return;
      }
      setRoute(await res.json());
    } catch {
      setError("Failed to load route. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRoute();
  }, [fetchRoute]);

  // Fetch similar routes in the same state
  useEffect(() => {
    if (!route) return;
    async function fetchSimilar() {
      setLoadingSimilar(true);
      try {
        const params = new URLSearchParams();
        params.set("state", route!.state);
        params.set("page", "0");
        const res = await fetch(`/api/routes?${params}`);
        if (res.ok) {
          const data = await res.json();
          const items: RouteListing[] = data.routes ?? [];
          setSimilarRoutes(items.filter((r) => r.id !== route!.id).slice(0, 3));
        }
      } catch {
        // Silently fail
      } finally {
        setLoadingSimilar(false);
      }
    }
    fetchSimilar();
  }, [route]);

  // ---------- Loading ----------
  if (loading) return <DetailSkeleton />;

  // ---------- Error ----------
  if (error || !route) {
    return (
      <div className="min-h-screen bg-light">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-black-primary">
              {error || "Route not found"}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              The route listing you are looking for may have been removed or does not exist.
            </p>
            <Link
              href="/routes-for-sale"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-hover"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Routes for Sale
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(route.status);
  const locationLabels = route.location_types
    .map((lt) => LOCATION_TYPES.find((l) => l.value === lt)?.label ?? lt);

  return (
    <div className="min-h-screen bg-light">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/routes-for-sale"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-green-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Routes for Sale
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* ------------------------------------------------------------ */}
          {/* Main content                                                  */}
          {/* ------------------------------------------------------------ */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 animate-fade-in">
              {/* Header */}
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold text-black-primary sm:text-2xl leading-tight">
                    {route.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full ring-1 ring-inset ${statusConfig.bg} ${statusConfig.text} ${statusConfig.ring}`}
                    >
                      {statusConfig.label}
                    </span>
                    {route.includes_equipment && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200">
                        <Package className="h-3 w-3" />
                        Equipment Included
                      </span>
                    )}
                    {route.includes_contracts && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-200">
                        <FileText className="h-3 w-3" />
                        Contracts Included
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              {route.description && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-black-primary mb-2">
                    Route Description
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {route.description}
                  </p>
                </div>
              )}

              {/* Route Info */}
              <div className="mt-6 rounded-lg bg-light border border-green-100 p-4">
                <h3 className="text-sm font-semibold text-black-primary mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-green-primary" />
                  Route Details
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {route.city && route.state && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        City / State
                      </p>
                      <p className="text-sm font-medium text-black-primary mt-0.5">
                        {route.city}, {route.state}
                      </p>
                    </div>
                  )}
                  {locationLabels.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Location Types Served
                      </p>
                      <p className="text-sm font-medium text-black-primary mt-0.5">
                        {locationLabels.join(", ")}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                      Machines
                    </p>
                    <p className="text-sm font-medium text-black-primary mt-0.5">
                      {route.num_machines}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                      Locations / Stops
                    </p>
                    <p className="text-sm font-medium text-black-primary mt-0.5">
                      {route.num_locations}
                    </p>
                  </div>
                </div>
              </div>

              {/* Machine Types */}
              {route.machine_types.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-black-primary mb-2">
                    Machine Types
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {route.machine_types.map((mt) => (
                      <MachineTypeBadge key={mt} type={mt} size="md" />
                    ))}
                  </div>
                </div>
              )}

              {/* Financial & Stats Grid */}
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Asking Price */}
                <div className="rounded-lg bg-green-50 p-4 border border-green-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                    <DollarSign className="h-3.5 w-3.5" />
                    Asking Price
                  </div>
                  <p className="mt-1 text-2xl font-bold text-green-700">
                    {formatCurrency(route.asking_price)}
                  </p>
                </div>

                {/* Monthly Revenue */}
                {route.monthly_revenue != null && (
                  <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Monthly Revenue
                    </div>
                    <p className="mt-1 text-lg font-bold text-black-primary">
                      {formatCurrency(route.monthly_revenue)}
                      <span className="text-sm font-normal text-gray-500 ml-1">/ mo</span>
                    </p>
                  </div>
                )}

                {/* Machines */}
                <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                    <Cpu className="h-3.5 w-3.5" />
                    Machines
                  </div>
                  <p className="mt-1 text-lg font-bold text-black-primary">
                    {route.num_machines}
                  </p>
                </div>

                {/* Locations / Stops */}
                <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                    <Building2 className="h-3.5 w-3.5" />
                    Locations / Stops
                  </div>
                  <p className="mt-1 text-lg font-bold text-black-primary">
                    {route.num_locations}
                  </p>
                </div>
              </div>

              {/* Timestamps */}
              <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Posted {formatDate(route.created_at)} ({timeAgo(route.created_at)})
                </span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* Sidebar                                                       */}
          {/* ------------------------------------------------------------ */}
          <div className="space-y-6">
            {/* CTA Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24 animate-fade-in">
              <h3 className="text-lg font-bold text-black-primary">
                Interested in this route?
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Contact the admin to learn more about this route listing and start the acquisition process.
              </p>

              {route.asking_price != null && (
                <div className="mt-4 rounded-lg bg-green-50 border border-green-100 px-4 py-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Asking Price</p>
                  <p className="text-2xl font-bold text-green-700">{formatCurrency(route.asking_price)}</p>
                </div>
              )}

              <a
                href={`mailto:james@apexaivending.com?subject=${encodeURIComponent(`Route Inquiry: ${route.title}`)}&body=${encodeURIComponent(`Hi,\n\nI'm interested in the route listing "${route.title}" in ${route.city}, ${route.state}.\n\nRoute ID: ${route.id}\n\nPlease share more details.\n\nThank you`)}`}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
              >
                <Mail className="h-4 w-4" />
                Contact Admin
              </a>

              <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Status</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ring-1 ring-inset ${statusConfig.bg} ${statusConfig.text} ${statusConfig.ring}`}
                  >
                    {statusConfig.label}
                  </span>
                </div>
                {route.includes_equipment && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Equipment</span>
                    <span className="font-medium text-green-700">Included</span>
                  </div>
                )}
                {route.includes_contracts && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Contracts</span>
                    <span className="font-medium text-green-700">Included</span>
                  </div>
                )}
                {route.monthly_revenue != null && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Monthly Revenue</span>
                    <span className="font-medium text-black-primary">{formatCurrency(route.monthly_revenue)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* How it works */}
            <div className="bg-gradient-to-br from-green-50 to-light-warm rounded-xl border border-green-100 p-5">
              <h4 className="text-sm font-semibold text-black-primary mb-2">
                How route sales work
              </h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Browse available vending routes by location and revenue.
                Contact the admin to verify financials, review route details,
                and negotiate terms with the seller through Vending Connector.
              </p>
              <Link
                href="/routes-for-sale"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-green-primary hover:text-green-hover transition-colors"
              >
                Browse All Routes
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Similar Routes                                                   */}
        {/* ---------------------------------------------------------------- */}
        {(loadingSimilar || similarRoutes.length > 0) && (
          <section className="mt-12">
            <h2 className="text-lg font-bold text-black-primary mb-5">
              More Routes for Sale
            </h2>

            {loadingSimilar && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading similar routes...
              </div>
            )}

            {!loadingSimilar && similarRoutes.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {similarRoutes.map((r) => (
                  <SimilarRouteCard key={r.id} route={r} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
