"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  MapPin,
  ShoppingBag,
  Clock,
  Search,
  Download,
  Phone,
  Mail,
  User,
  Building2,
  DollarSign,
  Package,
  Plus,
  Tag,
  LayoutGrid,
  List,
  Trash2,
} from "lucide-react";
import type { MachineType } from "@/lib/types";
import MachineTypeBadge from "@/app/components/MachineTypeBadge";
import { useRealtimeSubscription } from "@/lib/useRealtimeSubscription";


interface PurchasedLead {
  id: string;
  request_id: string;
  amount_cents: number;
  buyer_email: string | null;
  stripe_checkout_session_id: string | null;
  created_at: string;
  vending_requests: {
    id: string;
    title: string;
    location_name: string;
    address: string | null;
    city: string;
    state: string;
    zip: string | null;
    location_type: string;
    machine_types_wanted: MachineType[];
    estimated_daily_traffic: number | null;
    price: number | null;
    urgency: string;
    commission_offered: boolean;
    commission_notes: string | null;
    description: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    decision_maker_name: string | null;
  } | null;
}

interface UserListing {
  id: string;
  title: string;
  description: string | null;
  listing_type: "lead" | "location" | "route";
  price: number;
  city: string | null;
  state: string | null;
  status: string;
  is_public: boolean;
  created_at: string;
}

const LISTING_TYPE_LABELS: Record<string, string> = {
  lead: "Vending Lead",
  location: "Location",
  route: "Route",
};

function formatPrice(val: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function LeadCard({ purchase }: { purchase: PurchasedLead }) {
  const lead = purchase.vending_requests;
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  const handleDownloadReceipt = useCallback(async () => {
    if (!lead) return;
    setDownloadingReceipt(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import("jspdf/dist/jspdf.es.min.js");
      const jsPDF = mod.jsPDF ?? mod.default;
      const doc = new jsPDF({ unit: "pt", format: "letter" });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 50;
      let y = 60;

      // Header — VendingConnector branding
      doc.setFontSize(22);
      doc.setTextColor(22, 163, 74);
      doc.text("VendingConnector", pageWidth / 2, y, { align: "center" });
      y += 24;
      doc.setFontSize(12);
      doc.setTextColor(107, 114, 128);
      doc.text("Purchase Receipt", pageWidth / 2, y, { align: "center" });
      y += 12;
      doc.setFontSize(10);
      doc.text("Your lead purchase has been confirmed.", pageWidth / 2, y, {
        align: "center",
      });
      y += 30;

      // Divider
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, y, pageWidth - margin, y);
      y += 25;

      // Lead details section
      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.text("Lead Details", margin, y);
      y += 20;

      const leadRows: [string, string][] = [
        ["Location Name", lead.location_name || "N/A"],
        ["City / State", `${lead.city}, ${lead.state}`],
        ["Address", lead.address || "N/A"],
        [
          "Machine Types",
          lead.machine_types_wanted.join(", ") || "N/A",
        ],
        ["Price Paid", formatCurrency(purchase.amount_cents)],
      ];

      doc.setFontSize(10);
      for (const [label, value] of leadRows) {
        doc.setTextColor(107, 114, 128);
        doc.text(label, margin, y);
        doc.setTextColor(17, 24, 39);
        const maxWidth = pageWidth - margin - 180;
        const lines = doc.splitTextToSize(value, maxWidth);
        doc.text(lines, pageWidth - margin, y, { align: "right" });
        y += Math.max(lines.length, 1) * 14 + 4;
      }

      y += 10;
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, y, pageWidth - margin, y);
      y += 25;

      // Purchase info section
      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.text("Purchase Information", margin, y);
      y += 20;

      const purchaseRows: [string, string][] = [
        ["Buyer Email", purchase.buyer_email || "N/A"],
        ["Purchase Date", formatDateTime(purchase.created_at)],
        ["Order ID", purchase.id],
        [
          "Stripe Reference",
          purchase.stripe_checkout_session_id || "N/A",
        ],
      ];

      doc.setFontSize(10);
      for (const [label, value] of purchaseRows) {
        doc.setTextColor(107, 114, 128);
        doc.text(label, margin, y);
        doc.setTextColor(17, 24, 39);
        const maxWidth = pageWidth - margin - 180;
        const lines = doc.splitTextToSize(value, maxWidth);
        doc.text(lines, pageWidth - margin, y, { align: "right" });
        y += Math.max(lines.length, 1) * 14 + 4;
      }

      y += 10;
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, y, pageWidth - margin, y);
      y += 25;

      // Amount paid
      doc.setFontSize(13);
      doc.setTextColor(17, 24, 39);
      doc.text("Amount Paid", margin, y);
      doc.setFontSize(18);
      doc.setTextColor(22, 163, 74);
      doc.text(formatCurrency(purchase.amount_cents), pageWidth - margin, y, {
        align: "right",
      });
      y += 40;

      // Footer
      doc.setFontSize(9);
      doc.setTextColor(156, 163, 175);
      doc.text(
        "Thank you for your purchase! Questions? james@apexaivending.com | (888) 851-1462",
        pageWidth / 2,
        y,
        { align: "center" }
      );

      doc.save(`receipt-${lead.title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    } catch {
      // silently fail — user can retry
    } finally {
      setDownloadingReceipt(false);
    }
  }, [lead, purchase]);

  if (!lead) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4">
        <h3 className="font-semibold text-black-primary text-base leading-snug">
          {lead.title}
        </h3>
        <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>
            {lead.city}, {lead.state}
          </span>
        </div>
      </div>

      {/* Card body — full unblurred details */}
      <div className="px-6 py-5 space-y-4">
        {/* Location info */}
        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-start gap-2">
            <Building2 className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
            <div>
              <p className="text-xs font-medium text-gray-500">
                Location Name
              </p>
              <p className="text-sm text-black-primary">
                {lead.location_name}
              </p>
            </div>
          </div>

          {lead.address && (
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-500">Address</p>
                <p className="text-sm text-black-primary">
                  {lead.address}
                  {lead.zip && `, ${lead.zip}`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Contact info */}
        <div className="rounded-lg bg-green-50 border border-green-100 p-3 space-y-2">
          {lead.decision_maker_name && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-sm text-black-primary">
                {lead.decision_maker_name}
              </span>
            </div>
          )}
          {lead.contact_phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-green-600 shrink-0" />
              <a
                href={`tel:${lead.contact_phone}`}
                className="text-sm text-green-700 hover:underline"
              >
                {lead.contact_phone}
              </a>
            </div>
          )}
          {lead.contact_email && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-green-600 shrink-0" />
              <a
                href={`mailto:${lead.contact_email}`}
                className="text-sm text-green-700 hover:underline"
              >
                {lead.contact_email}
              </a>
            </div>
          )}
          {!lead.decision_maker_name &&
            !lead.contact_phone &&
            !lead.contact_email && (
              <p className="text-sm text-gray-500 italic">
                Contact info pending — the admin will update this shortly.
              </p>
            )}
        </div>

        {/* Machine types */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">
            Machine Types
          </p>
          <div className="flex flex-wrap gap-1">
            {lead.machine_types_wanted.map((mt) => (
              <MachineTypeBadge key={mt} type={mt} size="sm" />
            ))}
          </div>
        </div>

        {/* Price + purchase date row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1 text-sm">
            <DollarSign className="w-3.5 h-3.5 text-green-600" />
            <span className="font-semibold text-green-700">
              {formatCurrency(purchase.amount_cents)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            Purchased {formatDate(purchase.created_at)}
          </div>
        </div>
      </div>

      {/* Card footer — Download Receipt */}
      <div className="border-t border-gray-100 px-6 py-3">
        <button
          onClick={handleDownloadReceipt}
          disabled={downloadingReceipt}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloadingReceipt ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating PDF...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download Receipt (PDF)
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function ListingCard({ listing, onRemove }: { listing: UserListing; onRemove?: () => void }) {
  const statusColors: Record<string, string> = {
    active: "bg-green-50 text-green-700",
    sold: "bg-blue-50 text-blue-700",
    expired: "bg-gray-100 text-gray-600",
    pending_verification: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="group rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
      <Link href={`/marketplace/${listing.id}`} className="block p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="font-semibold text-black-primary group-hover:text-green-primary transition-colors line-clamp-2">
            {listing.title}
          </h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[listing.status] || "bg-gray-100 text-gray-600"}`}>
            {listing.status === "pending_verification" ? "Pending Verification" : listing.status}
          </span>
        </div>

        <div className="flex items-center gap-1 text-sm text-black-primary/50">
          <Tag className="h-3.5 w-3.5" />
          {LISTING_TYPE_LABELS[listing.listing_type] || listing.listing_type}
        </div>

        {(listing.city || listing.state) && (
          <div className="mt-1.5 flex items-center gap-1 text-sm text-black-primary/50">
            <MapPin className="h-3.5 w-3.5" />
            {[listing.city, listing.state].filter(Boolean).join(", ")}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold text-green-primary">
            {formatPrice(listing.price)}
          </span>
          <span className="text-xs text-black-primary/40">
            {formatDate(listing.created_at)}
          </span>
        </div>
      </Link>
      {listing.status === "active" && onRemove && (
        <div className="border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onRemove}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove Listing
          </button>
        </div>
      )}
    </div>
  );
}

type ViewMode = "grid" | "list";

export default function YourLeadsPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<PurchasedLead[]>([]);
  const [myListings, setMyListings] = useState<UserListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const fetchPurchases = useCallback(async () => {
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
  }, [router]);

  const fetchMyListings = useCallback(async () => {
    try {
      const res = await fetch("/api/user-listings?seller_id=me");
      if (res.ok) {
        const data = await res.json();
        setMyListings(data.listings ?? []);
      }
    } catch {
      // silently fail
    }
  }, []);

  const handleRemoveListing = useCallback(async (id: string) => {
    if (!confirm("Remove this listing? It will no longer be visible on the marketplace.")) return;
    try {
      const res = await fetch(`/api/user-listings/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMyListings((prev) => prev.filter((l) => l.id !== id));
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchPurchases();
    fetchMyListings();
  }, [fetchPurchases, fetchMyListings]);

  // Live-update when admin edits contact info or a new purchase completes
  useRealtimeSubscription(
    [
      {
        table: "vending_requests",
        event: "UPDATE",
        onEvent: () => fetchPurchases(),
      },
      {
        table: "lead_purchases",
        event: "UPDATE",
        onEvent: () => fetchPurchases(),
      },
      {
        table: "user_listings",
        event: "*",
        onEvent: () => fetchMyListings(),
      },
    ],
    [fetchPurchases, fetchMyListings]
  );

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50">
                <ShoppingBag className="h-6 w-6 text-green-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-black-primary">
                  Your Leads
                </h1>
                <p className="mt-1 text-sm text-black-primary/50">
                  Your posted listings and purchased leads
                </p>
              </div>
            </div>
            <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`rounded-md p-2 transition-colors cursor-pointer ${viewMode === "grid" ? "bg-green-primary text-white shadow-sm" : "text-black-primary/40 hover:text-black-primary/70"}`}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-md p-2 transition-colors cursor-pointer ${viewMode === "list" ? "bg-green-primary text-white shadow-sm" : "text-black-primary/40 hover:text-black-primary/70"}`}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">
        {viewMode === "list" ? (
          /* ============ LIST / TABLE VIEW ============ */
          <>
            {/* Listings Table */}
            <section>
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-green-primary" />
                  <h2 className="text-lg font-bold text-black-primary">Your Listings</h2>
                  {myListings.length > 0 && (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      {myListings.length}
                    </span>
                  )}
                </div>
                <Link
                  href="/my-listings"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
                >
                  <Plus className="h-4 w-4" />
                  Post a Listing
                </Link>
              </div>

              {myListings.length === 0 ? (
                <p className="rounded-xl border border-gray-100 bg-white px-6 py-8 text-center text-sm text-black-primary/40">No listings yet — post a location, lead, or route for sale.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50/50">
                      <tr>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Title</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Type</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Location</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Price</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Status</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Posted</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {myListings.map((listing) => {
                        const statusColors: Record<string, string> = {
                          active: "bg-green-50 text-green-700",
                          sold: "bg-blue-50 text-blue-700",
                          expired: "bg-gray-100 text-gray-600",
                        };
                        return (
                          <tr key={listing.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3">
                              <Link href={`/marketplace/${listing.id}`} className="font-medium text-black-primary hover:text-green-primary transition-colors">
                                {listing.title}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-black-primary/60">
                              {LISTING_TYPE_LABELS[listing.listing_type] || listing.listing_type}
                            </td>
                            <td className="px-4 py-3 text-black-primary/60">
                              {[listing.city, listing.state].filter(Boolean).join(", ") || "—"}
                            </td>
                            <td className="px-4 py-3 font-semibold text-green-primary">
                              {formatPrice(listing.price)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[listing.status] || "bg-gray-100 text-gray-600"}`}>
                                {listing.status === "pending_verification" ? "Pending Verification" : listing.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-black-primary/40 text-xs whitespace-nowrap">
                              {formatDate(listing.created_at)}
                            </td>
                            <td className="px-4 py-3">
                              {listing.status === "active" && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveListing(listing.id)}
                                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                  title="Remove listing"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Purchased Leads Table */}
            <section>
              <div className="mb-5 flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-green-primary" />
                <h2 className="text-lg font-bold text-black-primary">Purchased Leads</h2>
                {purchases.length > 0 && (
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    {purchases.length}
                  </span>
                )}
              </div>

              {purchases.length === 0 ? (
                <p className="rounded-xl border border-gray-100 bg-white px-6 py-8 text-center text-sm text-black-primary/40">No purchased leads yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50/50">
                      <tr>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Location</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Address</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Contact</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Phone</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Email</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Machine Types</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Paid</th>
                        <th className="px-4 py-3 font-medium text-black-primary/60">Purchased</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {purchases.map((purchase) => {
                        const lead = purchase.vending_requests;
                        if (!lead) return null;
                        return (
                          <tr key={purchase.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 font-medium text-black-primary">
                              {lead.location_name || lead.title}
                            </td>
                            <td className="px-4 py-3 text-black-primary/60 text-xs">
                              {[lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(", ") || "—"}
                            </td>
                            <td className="px-4 py-3 text-black-primary/70">
                              {lead.decision_maker_name || "—"}
                            </td>
                            <td className="px-4 py-3">
                              {lead.contact_phone ? (
                                <a href={`tel:${lead.contact_phone}`} className="text-green-primary hover:underline whitespace-nowrap">{lead.contact_phone}</a>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {lead.contact_email ? (
                                <a href={`mailto:${lead.contact_email}`} className="text-green-primary hover:underline">{lead.contact_email}</a>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {(lead.machine_types_wanted || []).map((mt) => (
                                  <MachineTypeBadge key={mt} type={mt} size="sm" />
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-semibold text-black-primary whitespace-nowrap">
                              {formatCurrency(purchase.amount_cents)}
                            </td>
                            <td className="px-4 py-3 text-black-primary/40 text-xs whitespace-nowrap">
                              {formatDate(purchase.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          /* ============ GRID / CARD VIEW ============ */
          <>
            {/* Your Listings Section */}
            <section>
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-green-primary" />
                  <h2 className="text-lg font-bold text-black-primary">Your Listings</h2>
                  {myListings.length > 0 && (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      {myListings.length}
                    </span>
                  )}
                </div>
                <Link
                  href="/my-listings"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
                >
                  <Plus className="h-4 w-4" />
                  Post a Listing
                </Link>
              </div>

              {myListings.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 px-6 py-12 text-center">
                  <Package className="mb-3 h-10 w-10 text-black-primary/20" />
                  <h3 className="text-base font-semibold text-black-primary">
                    No listings yet
                  </h3>
                  <p className="mt-1 text-sm text-black-primary/50 max-w-md">
                    Post a location, lead, or route for sale and it will appear here.
                  </p>
                  <Link
                    href="/my-listings"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-5 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100"
                  >
                    <Plus className="h-4 w-4" />
                    Sell a Location
                  </Link>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {myListings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} onRemove={() => handleRemoveListing(listing.id)} />
                  ))}
                </div>
              )}
            </section>

            {/* Purchased Leads Section */}
            <section>
              <div className="mb-5 flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-green-primary" />
                <h2 className="text-lg font-bold text-black-primary">Purchased Leads</h2>
                {purchases.length > 0 && (
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    {purchases.length}
                  </span>
                )}
              </div>

              {purchases.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 px-6 py-12 text-center">
                  <ShoppingBag className="mb-3 h-10 w-10 text-black-primary/20" />
                  <h3 className="text-base font-semibold text-black-primary">
                    No purchased leads yet
                  </h3>
                  <p className="mt-1 text-sm text-black-primary/50 max-w-md">
                    Browse available requests and purchase leads to unlock full
                    location details and contact information.
                  </p>
                  <Link
                    href="/browse-requests"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-5 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100"
                  >
                    <Search className="h-4 w-4" />
                    Locations for Sale
                  </Link>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {purchases.map((purchase) => (
                    <LeadCard key={purchase.id} purchase={purchase} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
