"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  X,
  ChevronDown,
  Check,
  Loader2,
  SearchX,
  MapPin,
  Star,
  BadgeCheck,
  Monitor,
  UserPlus,
} from "lucide-react";
import type { Profile, MachineType, OperatorListing } from "@/lib/types";
import { MACHINE_TYPES, US_STATES } from "@/lib/types";
import MachineTypeBadge from "../components/MachineTypeBadge";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 12;

const RATING_OPTIONS = [
  { value: "", label: "Any Rating" },
  { value: "4", label: "4+ Stars" },
  { value: "3", label: "3+ Stars" },
  { value: "2", label: "2+ Stars" },
];

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OperatorWithListings extends Profile {
  listings?: OperatorListing[];
  total_machines?: number;
  aggregated_machine_types?: string[];
  aggregated_cities?: string[];
  aggregated_states?: string[];
  aggregated_status?: "available" | "limited" | "full";
  accepts_commission?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Multi-select checkbox dropdown for machine types */
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
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy transition-colors hover:border-orange-primary/40 focus:outline-none focus:ring-2 focus:ring-orange-primary/20"
      >
        <span className="whitespace-nowrap">
          Machine Type
          {selected.length > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-primary px-1.5 text-[11px] font-bold text-white">
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
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-navy transition-colors hover:bg-orange-50"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    isChecked
                      ? "border-orange-primary bg-orange-primary"
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
                className="w-full rounded-md py-1.5 text-xs font-medium text-gray-500 hover:text-orange-primary transition-colors"
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

/** Simple dropdown select */
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
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy transition-colors hover:border-orange-primary/40 focus:outline-none focus:ring-2 focus:ring-orange-primary/20"
      >
        <span className="whitespace-nowrap">
          {value ? (
            <span>
              {label}:{" "}
              <span className="font-medium text-orange-primary">
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
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-orange-50 ${
              !value ? "text-orange-primary font-medium" : "text-gray-500"
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
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-orange-50 ${
                value === opt.value
                  ? "text-orange-primary font-medium bg-orange-50"
                  : "text-navy"
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

/** Skeleton loader for operator cards */
function OperatorCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="skeleton h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-3 w-1/2" />
        </div>
        <div className="skeleton h-6 w-16 rounded-full" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-3 w-16" />
      </div>
      <div className="mt-3 flex gap-1.5">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-5 w-14 rounded-full" />
      </div>
      <div className="mt-3">
        <div className="skeleton h-3 w-3/4" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="skeleton h-5 w-28 rounded-full" />
        <div className="flex gap-2">
          <div className="skeleton h-8 w-24 rounded-lg" />
          <div className="skeleton h-8 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Operator avatar with initials fallback */
function OperatorAvatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string;
  avatarUrl: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-12 w-12 text-sm",
    lg: "h-16 w-16 text-lg",
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover ring-2 ring-orange-100`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} flex items-center justify-center rounded-full bg-orange-primary font-bold text-white ring-2 ring-orange-100`}
    >
      {initials}
    </div>
  );
}

/** Status badge component */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    available: {
      bg: "bg-green-50",
      text: "text-green-700",
      dot: "bg-green-500",
      label: "Available",
    },
    limited: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      dot: "bg-amber-500",
      label: "Limited",
    },
    full: {
      bg: "bg-red-50",
      text: "text-red-700",
      dot: "bg-red-500",
      label: "Full",
    },
  };

  const c = config[status] ?? config.available;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot} animate-pulse-dot`} />
      {c.label}
    </span>
  );
}

/** Star rating display (inline, small) */
function InlineStarRating({
  value,
  count,
}: {
  value: number;
  count: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="inline-flex items-center gap-px">
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < Math.round(value)
                ? "fill-orange-primary text-orange-primary"
                : "fill-none text-gray-300"
            }`}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-navy">{value.toFixed(1)}</span>
      <span className="text-xs text-gray-400">({count})</span>
    </div>
  );
}

/** Operator card */
function OperatorCard({ operator }: { operator: OperatorWithListings }) {
  const machineTypes = operator.aggregated_machine_types ?? [];
  const cities = operator.aggregated_cities ?? [];
  const states = operator.aggregated_states ?? [];
  const totalMachines = operator.total_machines ?? 0;
  const status = operator.aggregated_status ?? "available";

  const locationParts: string[] = [];
  if (cities.length > 0) {
    const displayCities = cities.slice(0, 3);
    locationParts.push(displayCities.join(", "));
    if (cities.length > 3) locationParts.push(`+${cities.length - 3} more`);
  }
  if (states.length > 0) {
    locationParts.push(states.slice(0, 4).join(", "));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 transition-shadow hover:shadow-lg hover:shadow-orange-primary/5 group">
      {/* Header */}
      <div className="flex items-start gap-3">
        <OperatorAvatar name={operator.full_name} avatarUrl={operator.avatar_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-navy text-base leading-snug truncate">
              {operator.full_name}
            </h3>
            {operator.verified && (
              <BadgeCheck className="h-4.5 w-4.5 shrink-0 text-orange-primary" />
            )}
          </div>
          {operator.company_name && (
            <p className="text-sm text-gray-500 truncate">{operator.company_name}</p>
          )}
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Star Rating */}
      <div className="mt-2.5">
        <InlineStarRating value={operator.rating} count={operator.review_count} />
      </div>

      {/* Machine Types */}
      {machineTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {machineTypes.slice(0, 5).map((mt) => (
            <MachineTypeBadge key={mt} type={mt} size="sm" />
          ))}
          {machineTypes.length > 5 && (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-50 rounded-full ring-1 ring-inset ring-gray-200">
              +{machineTypes.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Location */}
      {locationParts.length > 0 && (
        <div className="flex items-center gap-1.5 mt-3 text-sm text-gray-500">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="truncate">{locationParts.join(" | ")}</span>
        </div>
      )}

      {/* Machines Badge */}
      {totalMachines > 0 && (
        <div className="flex items-center gap-1.5 mt-2 text-sm text-gray-600">
          <Monitor className="h-3.5 w-3.5 text-gray-400" />
          <span>
            <span className="font-medium text-navy">{totalMachines}</span> Machines Available
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        {operator.accepts_commission && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
            <Check className="h-3 w-3" />
            Commission OK
          </span>
        )}
        {!operator.accepts_commission && <span />}

        <div className="flex items-center gap-2">
          <Link
            href={`/operators/${operator.id}`}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-orange-primary/40 hover:bg-orange-50 hover:text-orange-primary"
          >
            View Profile
          </Link>
          <button
            type="button"
            onClick={() => alert("Sign up to connect with operators!")}
            className="inline-flex items-center gap-1 rounded-lg bg-orange-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-hover"
          >
            <UserPlus className="h-3 w-3" />
            Contact
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function BrowseOperatorsPage() {
  // Data state
  const [operators, setOperators] = useState<OperatorWithListings[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Search & filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [machineTypeFilters, setMachineTypeFilters] = useState<MachineType[]>([]);
  const [stateFilter, setStateFilter] = useState("");
  const [commissionFilter, setCommissionFilter] = useState(false);
  const [ratingFilter, setRatingFilter] = useState("");

  // Pagination
  const [page, setPage] = useState(0);

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
    setPage(0);
  }, [debouncedSearch, machineTypeFilters, stateFilter, commissionFilter, ratingFilter]);

  // ---------- Fetch operators ----------
  const fetchOperators = useCallback(
    async (pageNum: number, append: boolean = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        // Step 1: Fetch operator profiles
        const profileParams = new URLSearchParams();
        profileParams.set("mode", "profiles");
        if (debouncedSearch) profileParams.set("search", debouncedSearch);
        if (stateFilter) profileParams.set("state", stateFilter);
        profileParams.set("page", String(pageNum));

        const profileRes = await fetch(`/api/operators?${profileParams}`);
        if (!profileRes.ok) throw new Error("Failed to fetch operators");

        const profileData = await profileRes.json();
        const profiles: Profile[] = profileData.operators ?? [];
        const total: number = profileData.total ?? 0;

        // Step 2: Fetch listings for these operators to aggregate data
        const operatorIds = profiles.map((p) => p.id);
        let listingsByOperator: Record<string, OperatorListing[]> = {};

        if (operatorIds.length > 0) {
          const listingParams = new URLSearchParams();
          listingParams.set("mode", "listings");
          if (machineTypeFilters.length > 0)
            listingParams.set("machine_types", machineTypeFilters.join(","));
          if (commissionFilter) listingParams.set("commission", "true");
          // Fetch a large page to get all listings for these operators
          listingParams.set("page", "0");

          const listingRes = await fetch(`/api/operators?${listingParams}`);
          if (listingRes.ok) {
            const listingData = await listingRes.json();
            const allListings: OperatorListing[] = listingData.listings ?? [];

            for (const listing of allListings) {
              if (operatorIds.includes(listing.operator_id)) {
                if (!listingsByOperator[listing.operator_id]) {
                  listingsByOperator[listing.operator_id] = [];
                }
                listingsByOperator[listing.operator_id].push(listing);
              }
            }
          }
        }

        // Step 3: Merge profiles with aggregated listing data
        let enriched: OperatorWithListings[] = profiles.map((profile) => {
          const listings = listingsByOperator[profile.id] ?? [];
          const machineTypesSet = new Set<string>();
          const citiesSet = new Set<string>();
          const statesSet = new Set<string>();
          let totalMachines = 0;
          let hasCommission = false;
          let bestStatus: "available" | "limited" | "full" = "full";

          for (const listing of listings) {
            for (const mt of listing.machine_types) machineTypesSet.add(mt);
            for (const c of listing.cities_served) citiesSet.add(c);
            for (const s of listing.states_served) statesSet.add(s);
            totalMachines += listing.machine_count_available;
            if (listing.accepts_commission) hasCommission = true;
            if (listing.status === "available") bestStatus = "available";
            else if (listing.status === "limited" && bestStatus !== "available")
              bestStatus = "limited";
          }

          return {
            ...profile,
            listings,
            total_machines: totalMachines,
            aggregated_machine_types: Array.from(machineTypesSet),
            aggregated_cities: Array.from(citiesSet),
            aggregated_states: Array.from(statesSet),
            aggregated_status: listings.length > 0 ? bestStatus : "available",
            accepts_commission: hasCommission,
          };
        });

        // Client-side filtering for filters not handled by the API
        if (machineTypeFilters.length > 0) {
          enriched = enriched.filter((op) =>
            machineTypeFilters.some((mt) =>
              op.aggregated_machine_types?.includes(mt)
            )
          );
        }
        if (commissionFilter) {
          enriched = enriched.filter((op) => op.accepts_commission);
        }
        if (ratingFilter) {
          const minRating = parseFloat(ratingFilter);
          enriched = enriched.filter((op) => op.rating >= minRating);
        }

        if (append) {
          setOperators((prev) => [...prev, ...enriched]);
        } else {
          setOperators(enriched);
        }
        setTotalCount(total);
      } catch {
        if (!append) setOperators([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, machineTypeFilters, stateFilter, commissionFilter, ratingFilter]
  );

  useEffect(() => {
    fetchOperators(0);
  }, [fetchOperators]);

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchOperators(nextPage, true);
  }

  // ---------- Active filter count ----------
  const activeFilterCount =
    machineTypeFilters.length +
    (stateFilter ? 1 : 0) +
    (commissionFilter ? 1 : 0) +
    (ratingFilter ? 1 : 0);

  function clearAllFilters() {
    setSearch("");
    setMachineTypeFilters([]);
    setStateFilter("");
    setCommissionFilter(false);
    setRatingFilter("");
  }

  // ---------- Has more pages ----------
  const hasMore = operators.length < totalCount;

  // ---------- State options ----------
  const stateOptions = US_STATES.map((s) => ({
    value: s,
    label: `${s} - ${US_STATE_NAMES[s] ?? s}`,
  }));

  return (
    <div className="min-h-screen bg-cream">
      {/* ------------------------------------------------------------------ */}
      {/* Hero header */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-orange-100 bg-gradient-to-b from-peach to-cream">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
              Browse Vending Operators
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600 sm:text-lg">
              Find trusted vending machine operators ready to serve your
              location. Compare ratings, machine types, and service areas.
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
                placeholder="Search operators by name, city, state..."
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-10 text-sm shadow-sm placeholder:text-gray-400 focus:border-orange-primary focus:ring-2 focus:ring-orange-primary/20"
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
          <div className="flex items-center justify-between py-2 lg:py-0">
            {/* Mobile filter toggle */}
            <button
              type="button"
              onClick={() => setFiltersVisible(!filtersVisible)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-navy transition-colors hover:bg-orange-50 lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-primary px-1.5 text-[11px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <div className="lg:hidden" />
          </div>

          {/* Filters */}
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
                label="State"
                value={stateFilter}
                options={stateOptions}
                onChange={setStateFilter}
              />

              <FilterDropdown
                label="Min Rating"
                value={ratingFilter}
                options={RATING_OPTIONS}
                onChange={setRatingFilter}
              />

              {/* Commission toggle */}
              <button
                type="button"
                onClick={() => setCommissionFilter(!commissionFilter)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-orange-primary/20 ${
                  commissionFilter
                    ? "border-orange-primary bg-orange-50 text-orange-primary font-medium"
                    : "border-gray-200 bg-white text-navy hover:border-orange-primary/40"
                }`}
              >
                <span
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    commissionFilter ? "bg-orange-primary" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                      commissionFilter ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
                Commission Accepted
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
            {operators.length === 0
              ? "No operators found"
              : operators.length === 1
              ? "1 operator found"
              : `${operators.length.toLocaleString()} operators found`}
            {debouncedSearch && (
              <span>
                {" "}
                for &ldquo;
                <span className="font-medium text-navy">{debouncedSearch}</span>
                &rdquo;
              </span>
            )}
          </p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <OperatorCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && operators.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
              <SearchX className="h-7 w-7 text-orange-primary" />
            </div>
            <h3 className="text-lg font-semibold text-navy">
              No operators match your filters
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
              Try adjusting your search or filters to find available vending
              operators in your area.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-navy transition-colors hover:bg-gray-50"
                >
                  Clear All Filters
                </button>
              )}
              <Link
                href="/post-request"
                className="inline-flex items-center gap-2 rounded-lg bg-orange-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-hover"
              >
                Post a Request Instead
              </Link>
            </div>
          </div>
        )}

        {/* Operator cards grid */}
        {!loading && operators.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {operators.map((op) => (
                <OperatorCard key={op.id} operator={op} />
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-8 py-3 text-sm font-semibold text-navy shadow-sm transition-all hover:border-orange-primary/40 hover:shadow-md disabled:opacity-60"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>Load More Operators</>
                  )}
                </button>
              </div>
            )}

            {/* Page indicator */}
            {operators.length > 0 && (
              <p className="mt-4 text-center text-xs text-gray-400">
                Showing {operators.length} of {totalCount.toLocaleString()}{" "}
                operators
              </p>
            )}
          </>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom CTA */}
      {/* ------------------------------------------------------------------ */}
      {!loading && operators.length > 0 && (
        <section className="border-t border-orange-100 bg-peach">
          <div className="mx-auto max-w-7xl px-4 py-12 text-center sm:px-6 lg:px-8">
            <h2 className="text-xl font-bold text-navy sm:text-2xl">
              Are you a vending machine operator?
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-gray-600">
              Create your profile and start connecting with locations that need
              vending machines.
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-hover"
            >
              <UserPlus className="h-4 w-4" />
              Sign Up as Operator
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
