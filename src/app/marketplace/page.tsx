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
  ShoppingBag,
  Filter,
} from "lucide-react";
import { US_STATES, US_STATE_NAMES } from "@/lib/types";
import StaticMapPreview from "../components/StaticMapPreview";

interface Listing {
  id: string;
  title: string;
  description: string | null;
  listing_type: string;
  price: number;
  city: string | null;
  state: string | null;
  business_type: string | null;
  foot_traffic: string | null;
  status: string;
  created_at: string;
  profiles?: {
    full_name: string | null;
    company_name: string | null;
    city: string | null;
    state: string | null;
  };
}

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "lead", label: "Leads" },
  { value: "location", label: "Locations" },
  { value: "route", label: "Routes" },
];

const TYPE_LABELS: Record<string, string> = {
  lead: "Vending Lead",
  location: "Location",
  route: "Route",
};

function formatPrice(val: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

function daysAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="space-y-3">
        <div className="skeleton h-5 w-3/4" />
        <div className="skeleton h-4 w-1/2" />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
      </div>
      <div className="skeleton mt-4 h-4 w-1/3" />
    </div>
  );
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const fetchListings = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (stateFilter) params.set("state", stateFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);

    const res = await fetch(`/api/user-listings?${params}`);
    if (res.ok) {
      const data = await res.json();
      setListings(data.listings || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, [page, stateFilter, typeFilter]);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  const filtered = search
    ? listings.filter(l =>
        l.title.toLowerCase().includes(search.toLowerCase()) ||
        l.city?.toLowerCase().includes(search.toLowerCase()) ||
        l.business_type?.toLowerCase().includes(search.toLowerCase())
      )
    : listings;

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Marketplace</h1>
        <p className="text-gray-500 text-sm mt-1">Browse vending leads, locations, and routes posted by operators and location managers</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search listings..."
            className="w-full pl-10 pr-8 py-2 rounded-lg border border-gray-200 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>

        <select
          value={stateFilter}
          onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 outline-none"
        >
          <option value="">All States</option>
          {US_STATES.map(s => <option key={s} value={s}>{US_STATE_NAMES[s] || s}</option>)}
        </select>

        <div className="flex rounded-lg border border-gray-200 overflow-x-auto">
          {TYPE_TABS.map(t => (
            <button
              key={t.value}
              onClick={() => { setTypeFilter(t.value); setPage(1); }}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                typeFilter === t.value
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-gray-100">
          <SearchX className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-700 mb-1">No listings found</h3>
          <p className="text-gray-500 text-sm">Try adjusting your filters or check back later.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((l) => (
              <Link
                key={l.id}
                href={`/marketplace/${l.id}`}
                className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md hover:border-green-200 transition-all flex flex-col group"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    {TYPE_LABELS[l.listing_type] || l.listing_type}
                  </span>
                  <span className="text-xs text-gray-400">{daysAgo(l.created_at)}</span>
                </div>
                <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2 group-hover:text-green-700 transition-colors">
                  {l.title}
                </h3>
                {l.city && l.state && (
                  <StaticMapPreview
                    city={l.city}
                    state={l.state}
                    className="w-full h-24 my-2"
                  />
                )}
                {l.description && (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-2">{l.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-2">
                  {l.city && l.state && (
                    <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{l.city}, {l.state}</span>
                  )}
                  {!l.city && l.state && (
                    <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{l.state}</span>
                  )}
                  {l.business_type && (
                    <span className="bg-gray-100 px-2 py-0.5 rounded-full">{l.business_type}</span>
                  )}
                  {l.foot_traffic && (
                    <span className="bg-gray-100 px-2 py-0.5 rounded-full">{l.foot_traffic} traffic</span>
                  )}
                </div>
                <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="font-bold text-green-700 text-lg">{formatPrice(l.price)}</span>
                  <span className="text-xs text-green-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    View Details →
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* CTA for sellers */}
      <div className="mt-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-700 px-4 py-6 sm:p-8 text-white text-center">
        <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-80" />
        <h2 className="text-lg sm:text-xl font-bold mb-2">Have Leads or Locations to Sell?</h2>
        <p className="text-green-100 text-sm mb-4 max-w-md mx-auto">
          List your leads, locations, or routes for sale. You set the price — we handle the payment. You keep 85%.
        </p>
        <Link
          href="/my-listings"
          className="inline-flex items-center gap-2 bg-white text-green-700 font-semibold px-6 py-2.5 rounded-lg hover:bg-green-50 transition-colors text-sm"
        >
          Start Selling
        </Link>
      </div>
    </div>
  );
}
