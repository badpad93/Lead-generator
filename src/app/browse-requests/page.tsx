"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRealtimeSubscription } from "@/lib/useRealtimeSubscription";
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
  MapPin,
  DollarSign,
  Tag,
  ArrowRight,
  Clock,
  Package,
  LayoutGrid,
  List,
  Users,
  HandCoins,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
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
  { value: "matched", label: "Near Me" },
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
        <div className="absolute left-0 top-full z-30 mt-1 w-[calc(100vw-2rem)] sm:w-64 max-w-64 rounded-xl border border-gray-200 bg-white py-2 shadow-xl animate-fade-in">
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
        <div className="absolute left-0 top-full z-30 mt-1 max-h-60 w-[calc(100vw-2rem)] sm:w-56 max-w-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl animate-fade-in">
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
// Marketplace listing types + card
// ---------------------------------------------------------------------------

interface MarketplaceListing {
  id: string;
  title: string;
  description: string | null;
  listing_type: "lead" | "location" | "route";
  price: number;
  city: string | null;
  state: string | null;
  status: string;
  created_at: string;
  profiles?: { full_name: string | null; company_name: string | null } | null;
}

const LISTING_TYPE_LABELS: Record<string, string> = {
  lead: "Vending Lead",
  location: "Location",
  route: "Route",
};

function daysAgoStr(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function MarketplaceListingCard({ listing }: { listing: MarketplaceListing }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 transition-shadow hover:shadow-lg hover:shadow-green-primary/5 group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
            <Package className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-black-primary text-base leading-snug truncate">
              {listing.title}
            </h3>
            {listing.city && listing.state && (
              <div className="flex items-center gap-1 mt-0.5 text-sm text-gray-500">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {listing.city}, {listing.state}
                </span>
              </div>
            )}
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <Tag className="w-3 h-3" />
          For Sale
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {LISTING_TYPE_LABELS[listing.listing_type] || listing.listing_type}
        </span>
        {listing.profiles?.company_name && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
            {listing.profiles.company_name}
          </span>
        )}
      </div>

      {listing.price != null && (
        <div className="flex items-center gap-1.5 mt-3">
          <DollarSign className="w-4 h-4 text-green-600" />
          <span className="text-lg font-bold text-green-700">
            {listing.price.toLocaleString()}
          </span>
        </div>
      )}

      {listing.description && (
        <p className="mt-3 text-sm text-gray-500 line-clamp-2">
          {listing.description}
        </p>
      )}

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <Clock className="w-3 h-3" />
          {daysAgoStr(listing.created_at)}
        </span>
        <Link
          href={`/marketplace/${listing.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-green-primary hover:text-green-hover transition-colors group/link"
        >
          View Details
          <ArrowRight className="w-4 h-4 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function BrowseRequestsPage() {

  // Auth state
  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Data state
  const [requests, setRequests] = useState<VendingRequest[]>([]);
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>([]);
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

  // Pagination (0-indexed to match API)
  const [page, setPage] = useState(0);

  // Filters panel (mobile toggle)
  const [filtersVisible, setFiltersVisible] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // ---------- Check auth & fetch saved IDs ----------
  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token && session.user?.id) {
        setUserId(session.user.id);
        setAccessToken(session.access_token);
        // Fetch saved request IDs
        try {
          const res = await fetch("/api/saved-requests", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const ids = new Set<string>(data.map((s: { request_id: string }) => s.request_id));
            setSavedIds(ids);
          }
        } catch { /* ignore */ }
      }
    }
    init();
  }, []);

  // ---------- Debounce search ----------
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // ---------- Reset page when filters change ----------
  useEffect(() => {
    setPage(0);
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

        const headers: HeadersInit = {};
        if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
        const res = await fetch(`/api/requests?${params}`, { headers });
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
      accessToken,
    ]
  );

  // ---------- Fetch marketplace listings ----------
  const fetchMarketplaceListings = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (stateFilter) params.set("state", stateFilter);
      const res = await fetch(`/api/user-listings?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMarketplaceListings(data.listings ?? []);
      }
    } catch {
      // silently fail
    }
  }, [stateFilter]);

  useEffect(() => {
    fetchRequests(0);
    fetchMarketplaceListings();
  }, [fetchRequests, fetchMarketplaceListings]);

  // Live-remove leads when they become purchased (is_public → false)
  // and add new leads that appear
  useRealtimeSubscription(
    [
      {
        table: "vending_requests",
        onEvent: ({ eventType, new: row }) => {
          if (eventType === "UPDATE" && row) {
            if (!row.is_public || row.status === "matched" || row.status === "closed") {
              setRequests((prev) => prev.filter((r) => r.id !== row.id));
              setTotalCount((prev) => Math.max(0, prev - 1));
            }
          }
          if (eventType === "INSERT") {
            fetchRequests(0);
          }
        },
      },
      {
        table: "user_listings",
        event: "*" as const,
        onEvent: () => fetchMarketplaceListings(),
      },
    ],
    [fetchRequests, fetchMarketplaceListings]
  );

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

  // ---------- Save/unsave handler ----------
  async function handleSave(requestId: string) {
    if (!userId || !accessToken) {
      alert("Sign up to save requests and get notified about new matches!");
      return;
    }
    const isSaved = savedIds.has(requestId);
    const method = isSaved ? "DELETE" : "POST";
    try {
      const res = await fetch("/api/saved-requests", {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ requestId }),
      });
      if (res.ok) {
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (isSaved) next.delete(requestId);
          else next.add(requestId);
          return next;
        });
      }
    } catch { /* ignore */ }
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
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by city, state, or location type..."
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

      {/* ------------------------------------------------------------------ */}
      {/* Filter bar */}
      {/* ------------------------------------------------------------------ */}
      <section className="sticky top-16 z-20 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Status tabs */}
          <div className="flex items-center justify-between border-b border-gray-100">
            <div className="flex -mb-px overflow-x-auto">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={`relative px-2.5 py-2 sm:px-4 sm:py-3 text-sm font-medium transition-colors whitespace-nowrap ${
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

            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`rounded-md p-1.5 transition-colors cursor-pointer ${viewMode === "grid" ? "bg-green-primary text-white shadow-sm" : "text-black-primary/40 hover:text-black-primary/70"}`}
                  title="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`rounded-md p-1.5 transition-colors cursor-pointer ${viewMode === "list" ? "bg-green-primary text-white shadow-sm" : "text-black-primary/40 hover:text-black-primary/70"}`}
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </button>
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
          <div className="grid grid-cols-1 gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && requests.length === 0 && marketplaceListings.length === 0 && (
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

        {viewMode === "list" ? (
          /* ============ LIST / TABLE VIEW ============ */
          <>
            {/* Marketplace Listings Table */}
            {!loading && marketplaceListings.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-base sm:text-lg font-bold text-black-primary">Locations For Sale</h2>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {marketplaceListings.length}
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50/50">
                      <tr>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Title</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Type</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Location</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Price</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Seller</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Posted</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {marketplaceListings.map((listing) => (
                        <tr key={listing.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-medium text-black-primary max-w-[200px] truncate">
                            {listing.title}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                              {LISTING_TYPE_LABELS[listing.listing_type] || listing.listing_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-black-primary/60 whitespace-nowrap">
                            {[listing.city, listing.state].filter(Boolean).join(", ") || "—"}
                          </td>
                          <td className="px-4 py-3 font-semibold text-green-primary whitespace-nowrap">
                            ${listing.price.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-black-primary/60">
                            {listing.profiles?.company_name || listing.profiles?.full_name || "—"}
                          </td>
                          <td className="px-4 py-3 text-black-primary/40 text-xs whitespace-nowrap">
                            {daysAgoStr(listing.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/marketplace/${listing.id}`}
                              className="inline-flex items-center gap-1 text-sm font-medium text-green-primary hover:text-green-hover transition-colors"
                            >
                              View <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Vending Requests Table */}
            {!loading && requests.length > 0 && (
              <>
                {marketplaceListings.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <Search className="h-5 w-5 text-green-primary" />
                    <h2 className="text-base sm:text-lg font-bold text-black-primary">Vending Requests</h2>
                  </div>
                )}
                <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50/50">
                      <tr>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Title</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Location</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Machine Types</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Traffic</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Commission</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Price</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Urgency</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Posted</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {requests.map((req) => (
                        <tr key={req.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-medium text-black-primary max-w-[200px] truncate">
                            {req.title}
                          </td>
                          <td className="px-4 py-3 text-black-primary/60 whitespace-nowrap">
                            {req.city && req.state ? `${req.city}, ${req.state}` : req.state || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {(req.machine_types_wanted || []).slice(0, 3).map((mt) => (
                                <span key={mt} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-200 whitespace-nowrap">
                                  {mt}
                                </span>
                              ))}
                              {(req.machine_types_wanted || []).length > 3 && (
                                <span className="text-[10px] text-gray-400">+{req.machine_types_wanted.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-black-primary/60 whitespace-nowrap">
                            {req.estimated_daily_traffic != null ? (
                              <span className="flex items-center gap-1">
                                <Users className="w-3.5 h-3.5 text-gray-400" />
                                {req.estimated_daily_traffic.toLocaleString()}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {req.commission_offered ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
                                <HandCoins className="w-3 h-3" /> Yes
                              </span>
                            ) : (
                              <span className="text-black-primary/30 text-xs">No</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-green-primary whitespace-nowrap">
                            {req.price != null ? `$${req.price.toLocaleString()}` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                              req.urgency === "asap" ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200" :
                              req.urgency === "within_2_weeks" ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" :
                              req.urgency === "within_1_month" ? "bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-200" :
                              "bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200"
                            }`}>
                              {req.urgency.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-black-primary/40 text-xs whitespace-nowrap">
                            {daysAgoStr(req.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/requests/${req.id}`}
                              className="inline-flex items-center gap-1 text-sm font-medium text-green-primary hover:text-green-hover transition-colors"
                            >
                              View <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Load more */}
                {hasMore && (
                  <div className="mt-6 flex justify-center">
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

                {requests.length > 0 && (
                  <p className="mt-4 text-center text-xs text-gray-400">
                    Showing {requests.length} of {totalCount.toLocaleString()} requests
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          /* ============ GRID / CARD VIEW ============ */
          <>
            {/* Marketplace listings */}
            {!loading && marketplaceListings.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-base sm:text-lg font-bold text-black-primary">Locations For Sale</h2>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {marketplaceListings.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {marketplaceListings.map((listing) => (
                    <MarketplaceListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
              </div>
            )}

            {/* Request cards grid */}
            {!loading && requests.length > 0 && (
              <>
                {marketplaceListings.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <Search className="h-5 w-5 text-green-primary" />
                    <h2 className="text-base sm:text-lg font-bold text-black-primary">Vending Requests</h2>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {requests.map((req) => (
                    <RequestCard
                      key={req.id}
                      request={req}
                      saved={savedIds.has(req.id)}
                      onSave={() => handleSave(req.id)}
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
              Post your request and let qualified operators come to you.
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
