"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  X,
  Loader2,
  SearchX,
  MapPin,
  DollarSign,
  Cpu,
  Building2,
  Plus,
} from "lucide-react";
import type { RouteListing } from "@/lib/types";
import { MACHINE_TYPES, LOCATION_TYPES, US_STATES, US_STATE_NAMES } from "@/lib/types";
import MachineTypeBadge from "../components/MachineTypeBadge";

const PER_PAGE = 12;

function formatCurrency(val: number | null): string {
  if (val == null) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="space-y-3">
        <div className="skeleton h-5 w-3/4" />
        <div className="skeleton h-4 w-1/2" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="skeleton h-12 rounded-lg" />
        <div className="skeleton h-12 rounded-lg" />
      </div>
      <div className="mt-3 flex gap-1.5">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-4 w-20" />
      </div>
    </div>
  );
}

function RouteCard({ route }: { route: RouteListing }) {
  const locationLabels = route.location_types
    .map((lt) => LOCATION_TYPES.find((l) => l.value === lt)?.label ?? lt)
    .slice(0, 2);

  return (
    <Link
      href="#"
      className="block rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-lg hover:shadow-green-primary/5 group"
    >
      {/* Title */}
      <h3 className="font-semibold text-black-primary leading-snug group-hover:text-green-primary transition-colors line-clamp-2">
        {route.title}
      </h3>

      {/* Location */}
      {route.city && route.state &&
        route.city.toLowerCase() !== "unknown" &&
        route.state.toLowerCase() !== "unknown" && (
        <div className="flex items-center gap-1 mt-1.5 text-sm text-gray-500">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>{route.city}, {route.state}</span>
        </div>
      )}

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-green-50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Asking Price</p>
          <p className="text-sm font-bold text-green-700">{formatCurrency(route.asking_price)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Monthly Rev</p>
          <p className="text-sm font-bold text-black-primary">{formatCurrency(route.monthly_revenue)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500 font-medium">
            <Cpu className="w-3 h-3" /> Machines
          </div>
          <p className="text-sm font-bold text-black-primary">{route.num_machines}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500 font-medium">
            <Building2 className="w-3 h-3" /> Locations
          </div>
          <p className="text-sm font-bold text-black-primary">{route.num_locations}</p>
        </div>
      </div>

      {/* Machine types */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {route.machine_types.slice(0, 3).map((mt) => (
          <MachineTypeBadge key={mt} type={mt} size="sm" />
        ))}
        {route.machine_types.length > 3 && (
          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium text-gray-500 bg-gray-100 rounded-full">
            +{route.machine_types.length - 3}
          </span>
        )}
      </div>

      {/* Location types */}
      {locationLabels.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">
          {locationLabels.join(", ")}
          {route.location_types.length > 2 && ` +${route.location_types.length - 2}`}
        </p>
      )}

      {/* Includes badges */}
      <div className="flex gap-3 mt-3 text-xs text-gray-500">
        {route.includes_equipment && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Equipment included
          </span>
        )}
        {route.includes_contracts && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Contracts included
          </span>
        )}
      </div>

    </Link>
  );
}

export default function RoutesForSalePage() {
  const [routes, setRoutes] = useState<RouteListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, stateFilter]);

  const fetchRoutes = useCallback(
    async (pageNum: number, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (stateFilter) params.set("state", stateFilter);
        params.set("page", String(pageNum));

        const res = await fetch(`/api/routes?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");

        const data = await res.json();
        const items: RouteListing[] = data.routes ?? [];
        const total: number = data.total ?? items.length;

        if (append) setRoutes((prev) => [...prev, ...items]);
        else setRoutes(items);
        setTotalCount(total);
      } catch {
        if (!append) setRoutes([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, stateFilter]
  );

  useEffect(() => {
    fetchRoutes(0);
  }, [fetchRoutes]);

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRoutes(nextPage, true);
  }

  const hasMore = routes.length < totalCount;

  return (
    <div className="min-h-screen bg-light">
      {/* Hero */}
      <section className="border-b border-green-100 bg-gradient-to-b from-light-warm to-light">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-black-primary sm:text-4xl">
              Routes for Sale
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600 sm:text-lg">
              Browse vending routes and businesses available for purchase
            </p>
            <div className="mt-5">
              <Link
                href="/post-route"
                className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
              >
                <Plus className="h-4 w-4" />
                Post a Route for Sale
              </Link>
            </div>
          </div>

          {/* Search */}
          <div className="mx-auto mt-8 max-w-2xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by city, state, or title..."
                style={{ paddingLeft: '2.25rem' }}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pr-10 text-sm shadow-sm placeholder:text-gray-400 focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <section className="sticky top-16 z-20 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
            >
              <option value="">All States</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s} - {US_STATE_NAMES[s] ?? s}</option>
              ))}
            </select>

            {stateFilter && (
              <button
                type="button"
                onClick={() => setStateFilter("")}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Clear filter
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {!loading && (
          <p className="mb-6 text-sm text-gray-500">
            {totalCount === 0
              ? "No routes found"
              : totalCount === 1
              ? "1 route found"
              : `${totalCount.toLocaleString()} routes found`}
            {debouncedSearch && (
              <span>
                {" "}for &ldquo;
                <span className="font-medium text-black-primary">{debouncedSearch}</span>
                &rdquo;
              </span>
            )}
          </p>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!loading && routes.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <SearchX className="h-7 w-7 text-green-primary" />
            </div>
            <h3 className="text-lg font-semibold text-black-primary">
              No routes available
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
              There are no vending routes for sale matching your search. Check back later for new listings.
            </p>
          </div>
        )}

        {!loading && routes.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {routes.map((route) => (
                <RouteCard key={route.id} route={route} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-8 py-3 text-sm font-semibold text-black-primary shadow-sm transition-all hover:border-green-primary/40 hover:shadow-md disabled:opacity-60"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load More Routes"
                  )}
                </button>
              </div>
            )}

            {routes.length > 0 && (
              <p className="mt-4 text-center text-xs text-gray-400">
                Showing {routes.length} of {totalCount.toLocaleString()} routes
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
