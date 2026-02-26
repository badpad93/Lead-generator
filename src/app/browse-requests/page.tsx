"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  X,
  ChevronDown,
  Check,
  Heart,
  Loader2,
  SearchX,
  PlusCircle,
} from "lucide-react";
import type { VendingRequest, MachineType, LocationType, Urgency } from "@/lib/types";
import {
  MACHINE_TYPES,
  LOCATION_TYPES,
  URGENCY_OPTIONS,
  US_STATES,
  US_STATE_NAMES,
} from "@/lib/types";
import RequestCard from "../components/RequestCard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 12;

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "matched", label: "Matched" },
] as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/* Multi-select checkbox dropdown for machine types */
function MachineTypeMultiSelect({
  selected,
  onChange,
}: {
  selected: MachineType[];
  onChange: (val: MachineType[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(mt: MachineType) {
    if (selected.includes(mt)) {
      onChange(selected.filter((t) => t !== mt));
    } else {
      onChange([...selected, mt]);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary transition-colors hover:border-green-primary/40 focus:outline-none focus:ring-2 focus:ring-green-primary/20"
      >
        <span className="whitespace-nowrap">
          Machine Type
          {selected.length > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-primary px-1.5 text-[11px] font-bold text-white">
              {selected.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-gray-200 bg-white py-2 shadow-xl animate-fade-in">
          {MACHINE_TYPES.map((mt) => {
            const isChecked = selected.includes(mt.value);
            return (
              <button
                key={mt.value}
                type="button"
                onClick={() => toggle(mt.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-black-primary transition-colors hover:bg-green-50"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    isChecked
                      ? "border-green-primary bg-green-primary"
                      : "border-gray-300 bg-white"
                  }`}
                >
                  {isChecked && <Check className="h-3 w-3 text-white" />}
                </span>
                {mt.label}
              </button>
            );
          })}
          {selected.length > 0 && (
            <div className="border-t border-gray-100 mt-1 pt-1 px-3">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-md py-1.5 text-xs font-medium text-gray-500 hover:text-green-primary transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Simple dropdown select */
function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary transition-colors hover:border-green-primary/40 focus:outline-none focus:ring-2 focus:ring-green-primary/20"
      >
        <span className="whitespace-nowrap">
          {value ? (
            <span>
              {label}:{" "}
              <span className="font-medium text-green-primary">
                {selectedLabel}
              </span>
            </span>
          ) : (
            label
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-60 w-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl animate-fade-in">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-green-50 ${
              !value ? "text-green-primary font-medium" : "text-gray-500"
            }`}
          >
            All
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-green-50 ${
                value === opt.value
                  ? "text-green-primary font-medium bg-green-50"
                  : "text-black-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Skeleton card for loading state */
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="skeleton h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
        </div>
        <div className="skeleton h-8 w-8 rounded-lg" />
      </div>
      <div className="mt-3 flex gap-1.5">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-5 w-14 rounded-full" />
      </div>
      <div className="mt-4 flex gap-4">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-4 w-28" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="flex gap-3">
          <div className="skeleton h-5 w-20 rounded-full" />
          <div className="skeleton h-4 w-16" />
        </div>
        <div className="skeleton h-4 w-24" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function BrowseRequestsPage() {
  // Data state
  const [requests, setRequests] = useState<VendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Search & filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [machineTypeFilters, setMachineTypeFilters] = useState<MachineType[]>([]);
  const [locationTypeFilter, setLocationTypeFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [commissionFilter, setCommissionFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Pagination
  const [page, setPage] = useState(1);

  // Filters panel (mobile toggle)
  const [filtersVisible, setFiltersVisible] = useState(false);

  // ---------- Debounce search ----------
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // ---------- Reset page when filters change ----------
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    machineTypeFilters,
    locationTypeFilter,
    stateFilter,
    urgencyFilter,
    commissionFilter,
    statusFilter,
  ]);

  // ---------- Fetch requests ----------
  const fetchRequests = useCallback(
    async (pageNum: number, append: boolean = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (locationTypeFilter) params.set("location_type", locationTypeFilter);
        if (stateFilter) params.set("state", stateFilter);
        if (urgencyFilter) params.set("urgency", urgencyFilter);
        if (commissionFilter) params.set("commission", "true");
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (machineTypeFilters.length > 0)
          params.set("machine_types", machineTypeFilters.join(","));
        params.set("page", String(pageNum));
        params.set("per_page", String(PER_PAGE));

        const res = await fetch(`/api/requests?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");

        const data = await res.json();
        const items: VendingRequest[] = Array.isArray(data)
          ? data
          : data.data ?? data.requests ?? [];
        const total: number =
          typeof data.total === "number"
            ? data.total
            : typeof data.count === "number"
            ? data.count
            : items.length;

        if (append) {
          setRequests((prev) => [...prev, ...items]);
        } else {
          setRequests(items);
        }
        setTotalCount(total);
      } catch {
        if (!append) setRequests([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      debouncedSearch,
      machineTypeFilters,
      locationTypeFilter,
      stateFilter,
      urgencyFilter,
      commissionFilter,
      statusFilter,
    ]
  );

  useEffect(() => {
    fetchRequests(1);
  }, [fetchRequests]);

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRequests(nextPage, true);
  }

  // ---------- Active filter count ----------
  const activeFilterCount =
    machineTypeFilters.length +
    (locationTypeFilter ? 1 : 0) +
    (stateFilter ? 1 : 0) +
    (urgencyFilter ? 1 : 0) +
    (commissionFilter ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0);

  function clearAllFilters() {
    setSearch("");
    setMachineTypeFilters([]);
    setLocationTypeFilter("");
    setStateFilter("");
    setUrgencyFilter("");
    setCommissionFilter(false);
    setStatusFilter("all");
  }

  // ---------- Save handler (public page - prompt signup) ----------
  function handleSave() {
    alert("Sign up to save requests and get notified about new matches!");
  }

  // ---------- Has more pages ----------
  const hasMore = requests.length < totalCount;

  // ---------- State options (for dropdown) ----------
  const stateOptions = US_STATES.map((s) => ({
    value: s,
    label: `${s} - ${US_STATE_NAMES[s] ?? s}`,
  }));

  return (
    <div className="min-h-screen bg-light">
      {/* ------------------------------------------------------------------ */}
      {/* Hero header */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-green-100 bg-gradient-to-b from-light-warm to-light">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-black-primary sm:text-4xl">
              Browse Vending Requests
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600 sm:text-lg">
              Find locations looking for vending machines and grow your route
            </p>
          </div>

          {/* Search bar */}
          <div className="mx-auto mt-8 max-w-2xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by city, state, or location type..."
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-10 text-sm shadow-sm placeholder:text-gray-400 focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
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

      {/* ------------------------------------------------------------------ */}
      {/* Filter bar */}
      {/* ------------------------------------------------------------------ */}
      <section className="sticky top-16 z-20 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Status tabs */}
          <div className="flex items-center justify-between border-b border-gray-100">
            <div className="flex -mb-px">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                    statusFilter === tab.value
                      ? "text-green-primary"
                      : "text-gray-500 hover:text-black-primary"
                  }`}
                >
                  {tab.label}
                  {statusFilter === tab.value && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-green-primary" />
                  )}
                </button>
              ))}
            </div>

            {/* Mobile filter toggle */}
            <button
              type="button"
              onClick={() => setFiltersVisible(!filtersVisible)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-black-primary transition-colors hover:bg-green-50 lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-primary px-1.5 text-[11px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Desktop filters -- always visible on lg+ */}
          <div
            className={`overflow-hidden transition-all lg:max-h-none lg:overflow-visible ${
              filtersVisible
                ? "max-h-96 py-3"
                : "max-h-0 py-0 lg:max-h-none lg:py-3"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <MachineTypeMultiSelect
                selected={machineTypeFilters}
                onChange={setMachineTypeFilters}
              />

              <FilterDropdown
                label="Location"
                value={locationTypeFilter}
                options={LOCATION_TYPES.map((lt) => ({
                  value: lt.value,
                  label: lt.label,
                }))}
                onChange={(v) => setLocationTypeFilter(v as LocationType | "")}
              />

              <FilterDropdown
                label="State"
                value={stateFilter}
                options={stateOptions}
                onChange={setStateFilter}
              />

              <FilterDropdown
                label="Urgency"
                value={urgencyFilter}
                options={URGENCY_OPTIONS.map((u) => ({
                  value: u.value,
                  label: u.label,
                }))}
                onChange={(v) => setUrgencyFilter(v as Urgency | "")}
              />

              {/* Commission toggle */}
              <button
                type="button"
                onClick={() => setCommissionFilter(!commissionFilter)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-primary/20 ${
                  commissionFilter
                    ? "border-green-primary bg-green-50 text-green-primary font-medium"
                    : "border-gray-200 bg-white text-black-primary hover:border-green-primary/40"
                }`}
              >
                <span
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    commissionFilter ? "bg-green-primary" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                      commissionFilter ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
                Commission Offered
              </button>

              {/* Active filters badge + clear */}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-200 px-1.5 text-[11px] font-bold text-gray-600">
                    {activeFilterCount}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Content */}
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Result count */}
        {!loading && (
          <p className="mb-6 text-sm text-gray-500">
            {totalCount === 0
              ? "No requests found"
              : totalCount === 1
              ? "1 request found"
              : `${totalCount.toLocaleString()} requests found`}
            {debouncedSearch && (
              <span>
                {" "}
                for &ldquo;
                <span className="font-medium text-black-primary">{debouncedSearch}</span>
                &rdquo;
              </span>
            )}
          </p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && requests.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <SearchX className="h-7 w-7 text-green-primary" />
            </div>
            <h3 className="text-lg font-semibold text-black-primary">
              No requests match your filters
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
              Try adjusting your search or filters. You can also post a new
              request to let operators find you.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-black-primary transition-colors hover:bg-gray-50"
                >
                  Clear All Filters
                </button>
              )}
              <Link
                href="/post-request"
                className="inline-flex items-center gap-2 rounded-lg bg-green-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
              >
                <PlusCircle className="h-4 w-4" />
                Post a Request
              </Link>
            </div>
          </div>
        )}

        {/* Request cards grid */}
        {!loading && requests.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {requests.map((req) => (
                <RequestCard
                  key={req.id}
                  request={req}
                  saved={false}
                  onSave={handleSave}
                />
              ))}
            </div>

            {/* Load more / pagination */}
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
                    <>Load More Requests</>
                  )}
                </button>
              </div>
            )}

            {/* Page indicator */}
            {requests.length > 0 && (
              <p className="mt-4 text-center text-xs text-gray-400">
                Showing {requests.length} of {totalCount.toLocaleString()}{" "}
                requests
              </p>
            )}
          </>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom CTA */}
      {/* ------------------------------------------------------------------ */}
      {!loading && requests.length > 0 && (
        <section className="border-t border-green-100 bg-light-warm">
          <div className="mx-auto max-w-7xl px-4 py-12 text-center sm:px-6 lg:px-8">
            <h2 className="text-xl font-bold text-black-primary sm:text-2xl">
              Have a location that needs a vending machine?
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-gray-600">
              Post your request for free and let qualified operators come to you.
            </p>
            <Link
              href="/post-request"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
            >
              <PlusCircle className="h-4 w-4" />
              Post a Request
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
