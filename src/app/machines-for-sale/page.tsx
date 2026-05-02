"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  X,
  Loader2,
  SearchX,
  MapPin,
  Plus,
  Package,
} from "lucide-react";
import type { MachineListing } from "@/lib/types";
import { US_STATES, US_STATE_NAMES } from "@/lib/types";

const MACHINE_TYPE_OPTIONS = [
  "AI Machine",
  "Snack",
  "Beverage",
  "Combo",
  "Coffee",
  "Micro Market",
  "Cold Food",
  "Frozen",
  "Healthy",
  "Specialty",
  "Other",
];

const CONDITION_LABELS: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  for_parts: "For Parts",
};

function formatCurrency(val: number | null): string {
  if (val == null) return "Contact for price";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
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
    </div>
  );
}

function MachineCard({ listing }: { listing: MachineListing }) {
  // Prefer the optimized thumbnail (300w WebP) for cards; fall back to the
  // first non-PDF in photos[] for legacy listings without structured URLs.
  const photo =
    listing.image_thumb_url ??
    listing.photos?.find((p) => !p.toLowerCase().endsWith(".pdf")) ??
    null;
  const conditionLabel = listing.condition
    ? CONDITION_LABELS[listing.condition] ?? listing.condition
    : null;

  return (
    <Link
      href={`/machines-for-sale/${listing.id}`}
      className="block rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-lg hover:shadow-green-primary/5 group"
    >
      {/* Photo */}
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={listing.title}
          loading="lazy"
          className="mb-4 h-40 w-full rounded-lg object-cover bg-gray-100"
        />
      ) : (
        <div className="mb-4 flex h-40 w-full items-center justify-center rounded-lg bg-gray-100">
          <Package className="h-10 w-10 text-gray-400" />
        </div>
      )}

      {/* Title */}
      <h3 className="font-semibold text-black-primary leading-snug group-hover:text-green-primary transition-colors line-clamp-2">
        {listing.title}
      </h3>

      {/* Location */}
      {listing.city && listing.state && (
        <div className="flex items-center gap-1 mt-1.5 text-sm text-gray-500">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>
            {listing.city}, {listing.state}
          </span>
        </div>
      )}

      {/* Description */}
      {listing.description && (
        <p className="mt-2 text-sm text-gray-600 line-clamp-2 group-hover:text-gray-700 transition-colors">
          {listing.description}
        </p>
      )}

      {/* Price + quantity */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-green-50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">
            Asking Price
          </p>
          <p className="text-sm font-bold text-green-700">
            {formatCurrency(listing.asking_price)}
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">
            Quantity
          </p>
          <p className="text-sm font-bold text-black-primary">
            {listing.quantity}
          </p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {listing.machine_type && (
          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium text-green-700 bg-green-50 rounded-full">
            {listing.machine_type}
          </span>
        )}
        {conditionLabel && (
          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium text-blue-700 bg-blue-50 rounded-full">
            {conditionLabel}
          </span>
        )}
        {(listing.machine_make || listing.machine_model) && (
          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium text-gray-600 bg-gray-100 rounded-full">
            {[listing.machine_make, listing.machine_model]
              .filter(Boolean)
              .join(" ")}
          </span>
        )}
      </div>

      {/* Includes badges */}
      <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
        {listing.includes_card_reader && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Card reader
          </span>
        )}
        {listing.includes_install && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Install incl.
          </span>
        )}
        {listing.includes_delivery && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Delivery incl.
          </span>
        )}
      </div>
    </Link>
  );
}

export default function MachinesForSalePage() {
  const [listings, setListings] = useState<MachineListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, stateFilter, typeFilter, conditionFilter]);

  const fetchListings = useCallback(
    async (pageNum: number, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (stateFilter) params.set("state", stateFilter);
        if (typeFilter) params.set("machine_type", typeFilter);
        if (conditionFilter) params.set("condition", conditionFilter);
        params.set("page", String(pageNum));

        const res = await fetch(`/api/machine-listings?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");

        const data = await res.json();
        const items: MachineListing[] = data.listings ?? [];
        const total: number = data.total ?? items.length;

        if (append) setListings((prev) => [...prev, ...items]);
        else setListings(items);
        setTotalCount(total);
      } catch {
        if (!append) setListings([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, stateFilter, typeFilter, conditionFilter]
  );

  useEffect(() => {
    fetchListings(0);
  }, [fetchListings]);

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchListings(nextPage, true);
  }

  const hasMore = listings.length < totalCount;

  return (
    <div className="min-h-screen bg-light">
      {/* Hero */}
      <section className="border-b border-green-100 bg-gradient-to-b from-light-warm to-light">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-black-primary sm:text-4xl">
              Machines for Sale
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600 sm:text-lg">
              Browse used and refurbished vending machines from operators
              across the country
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                href="/post-machine"
                className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
              >
                <Plus className="h-4 w-4" />
                Post a Machine for Sale
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
                placeholder="Search by make, model, city, state, or title..."
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-10 text-sm shadow-sm placeholder:text-gray-400 focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
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
                <option key={s} value={s}>
                  {s} - {US_STATE_NAMES[s] ?? s}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
            >
              <option value="">All Types</option>
              {MACHINE_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
            >
              <option value="">Any Condition</option>
              {Object.entries(CONDITION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>

            {(stateFilter || typeFilter || conditionFilter) && (
              <button
                type="button"
                onClick={() => {
                  setStateFilter("");
                  setTypeFilter("");
                  setConditionFilter("");
                }}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
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
              ? "No machines found"
              : totalCount === 1
              ? "1 machine found"
              : `${totalCount.toLocaleString()} machines found`}
            {debouncedSearch && (
              <span>
                {" "}
                for &ldquo;
                <span className="font-medium text-black-primary">
                  {debouncedSearch}
                </span>
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

        {!loading && listings.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <SearchX className="h-7 w-7 text-green-primary" />
            </div>
            <h3 className="text-lg font-semibold text-black-primary">
              No machines available
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
              There are no used vending machines for sale matching your search.
              Check back later for new listings.
            </p>
            <Link
              href="/post-machine"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
            >
              <Plus className="h-4 w-4" />
              Be the first to post
            </Link>
          </div>
        )}

        {!loading && listings.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <MachineCard key={listing.id} listing={listing} />
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
                    "Load More Machines"
                  )}
                </button>
              </div>
            )}

            {listings.length > 0 && (
              <p className="mt-4 text-center text-xs text-gray-400">
                Showing {listings.length} of {totalCount.toLocaleString()}{" "}
                machines
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
