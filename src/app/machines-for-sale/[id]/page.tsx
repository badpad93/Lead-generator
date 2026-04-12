"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  DollarSign,
  Clock,
  Loader2,
  AlertCircle,
  Mail,
  Package,
  Check,
  FileText,
  Download,
} from "lucide-react";
import type { MachineListing } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONDITION_LABELS: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  for_parts: "For Parts",
};

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
  if (val == null) return "Contact for price";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
}

function getStatusConfig(status: string) {
  switch (status) {
    case "active":
      return { bg: "bg-green-50", text: "text-green-700", ring: "ring-green-200", label: "Available" };
    case "sold":
      return { bg: "bg-slate-50", text: "text-slate-600", ring: "ring-slate-200", label: "Sold" };
    case "pending":
      return { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", label: "Pending Review" };
    case "rejected":
      return { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-200", label: "Rejected" };
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
              <div className="skeleton h-64 w-full rounded-lg mb-6" />
              <div className="skeleton h-6 w-3/4 mb-3" />
              <div className="skeleton h-4 w-1/2 mb-6" />
              <div className="grid grid-cols-2 gap-4">
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

function SimilarMachineCard({ listing }: { listing: MachineListing }) {
  return (
    <Link
      href={`/machines-for-sale/${listing.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 transition-shadow hover:shadow-lg hover:shadow-green-primary/5 group"
    >
      <h4 className="font-semibold text-black-primary text-sm leading-snug truncate group-hover:text-green-primary transition-colors">
        {listing.title}
      </h4>
      {listing.city && listing.state && (
        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {listing.city}, {listing.state}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="rounded-md bg-green-50 px-2 py-1">
          <p className="text-[10px] text-gray-500 font-medium">Price</p>
          <p className="text-xs font-bold text-green-700">
            {formatCurrency(listing.asking_price)}
          </p>
        </div>
        <div className="rounded-md bg-gray-50 px-2 py-1">
          <p className="text-[10px] text-gray-500 font-medium">Qty</p>
          <p className="text-xs font-bold text-black-primary">
            {listing.quantity}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end mt-3 pt-2 border-t border-gray-100">
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

export default function MachineDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [listing, setListing] = useState<MachineListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<MachineListing[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);

  const fetchListing = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/machine-listings/${id}`);
      if (!res.ok) {
        setError(
          res.status === 404 ? "Listing not found" : "Failed to load listing"
        );
        return;
      }
      setListing(await res.json());
    } catch {
      setError("Failed to load listing. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  // Fetch similar listings in same state
  useEffect(() => {
    if (!listing) return;
    async function fetchSimilar() {
      setLoadingSimilar(true);
      try {
        const params = new URLSearchParams();
        params.set("state", listing!.state);
        params.set("page", "0");
        const res = await fetch(`/api/machine-listings?${params}`);
        if (res.ok) {
          const data = await res.json();
          const items: MachineListing[] = data.listings ?? [];
          setSimilar(items.filter((r) => r.id !== listing!.id).slice(0, 3));
        }
      } catch {
        // Silently fail
      } finally {
        setLoadingSimilar(false);
      }
    }
    fetchSimilar();
  }, [listing]);

  if (loading) return <DetailSkeleton />;

  if (error || !listing) {
    return (
      <div className="min-h-screen bg-light">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-black-primary">
              {error || "Listing not found"}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              The machine listing you are looking for may have been removed or
              does not exist.
            </p>
            <Link
              href="/machines-for-sale"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-hover"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Machines for Sale
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(listing.status);
  const conditionLabel = listing.condition
    ? CONDITION_LABELS[listing.condition] ?? listing.condition
    : null;
  const allFiles = listing.photos || [];
  const images = allFiles.filter((u) => !u.toLowerCase().endsWith(".pdf"));
  const pdfs = allFiles.filter((u) => u.toLowerCase().endsWith(".pdf"));
  const safeActivePhoto = Math.min(activePhoto, Math.max(images.length - 1, 0));
  // For the primary view (first photo), prefer the optimized 1200w WebP
  // version. Legacy listings fall back to the raw photos[] entry.
  const mainPhoto =
    safeActivePhoto === 0
      ? listing.image_main_url ?? images[0] ?? null
      : images[safeActivePhoto] ?? null;

  return (
    <div className="min-h-screen bg-light">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/machines-for-sale"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-green-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Machines for Sale
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 animate-fade-in">
              {/* Photos */}
              {mainPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mainPhoto}
                  alt={listing.title}
                  loading="lazy"
                  className="mb-4 h-80 w-full rounded-lg object-cover bg-gray-100"
                />
              ) : (
                <div className="mb-4 flex h-80 w-full items-center justify-center rounded-lg bg-gray-100">
                  <Package className="h-16 w-16 text-gray-400" />
                </div>
              )}

              {images.length > 1 && (
                <div className="mb-6 flex gap-2 overflow-x-auto">
                  {images.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActivePhoto(i)}
                      className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                        i === safeActivePhoto
                          ? "border-green-primary"
                          : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p}
                        alt={`Photo ${i + 1}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* PDF spec sheets */}
              {pdfs.length > 0 && (
                <div className="mb-6 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Spec Sheets & Documents
                  </p>
                  {pdfs.map((pdf, i) => {
                    const raw = decodeURIComponent(
                      pdf.split("/").pop() || `Document ${i + 1}`
                    );
                    const filename = raw.replace(/^\d+-/, "");
                    return (
                      <a
                        key={i}
                        href={pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-green-primary hover:bg-green-50"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-black-primary truncate">
                            {filename}
                          </p>
                          <p className="text-xs text-gray-500">Click to view PDF</p>
                        </div>
                        <Download className="h-4 w-4 shrink-0 text-gray-400" />
                      </a>
                    );
                  })}
                </div>
              )}

              {/* Header */}
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <Package className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold text-black-primary sm:text-2xl leading-tight">
                    {listing.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full ring-1 ring-inset ${statusConfig.bg} ${statusConfig.text} ${statusConfig.ring}`}
                    >
                      {statusConfig.label}
                    </span>
                    {conditionLabel && (
                      <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200">
                        {conditionLabel}
                      </span>
                    )}
                    {listing.machine_type && (
                      <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
                        {listing.machine_type}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              {listing.description && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-black-primary mb-2">
                    Description
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {listing.description}
                  </p>
                </div>
              )}

              {/* Machine Details */}
              <div className="mt-6 rounded-lg bg-light border border-green-100 p-4">
                <h3 className="text-sm font-semibold text-black-primary mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4 text-green-primary" />
                  Machine Details
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {listing.city && listing.state && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Location
                      </p>
                      <p className="text-sm font-medium text-black-primary mt-0.5">
                        {listing.city}, {listing.state}
                      </p>
                    </div>
                  )}
                  {listing.machine_make && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Make
                      </p>
                      <p className="text-sm font-medium text-black-primary mt-0.5">
                        {listing.machine_make}
                      </p>
                    </div>
                  )}
                  {listing.machine_model && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Model
                      </p>
                      <p className="text-sm font-medium text-black-primary mt-0.5">
                        {listing.machine_model}
                      </p>
                    </div>
                  )}
                  {listing.machine_year && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Year
                      </p>
                      <p className="text-sm font-medium text-black-primary mt-0.5">
                        {listing.machine_year}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                      Quantity
                    </p>
                    <p className="text-sm font-medium text-black-primary mt-0.5">
                      {listing.quantity}
                    </p>
                  </div>
                </div>
              </div>

              {/* What's Included */}
              {(listing.includes_card_reader ||
                listing.includes_install ||
                listing.includes_delivery) && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-black-primary mb-2">
                    What&apos;s Included
                  </h3>
                  <ul className="space-y-1.5">
                    {listing.includes_card_reader && (
                      <li className="flex items-center gap-2 text-sm text-gray-700">
                        <Check className="h-4 w-4 text-green-primary" />
                        Credit card reader installed
                      </li>
                    )}
                    {listing.includes_install && (
                      <li className="flex items-center gap-2 text-sm text-gray-700">
                        <Check className="h-4 w-4 text-green-primary" />
                        Installation service included
                      </li>
                    )}
                    {listing.includes_delivery && (
                      <li className="flex items-center gap-2 text-sm text-gray-700">
                        <Check className="h-4 w-4 text-green-primary" />
                        Delivery service included
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Timestamps */}
              <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Posted {formatDate(listing.created_at)} (
                  {timeAgo(listing.created_at)})
                </span>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* CTA Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24 animate-fade-in">
              <h3 className="text-lg font-bold text-black-primary">
                Interested in this machine?
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Contact the admin to verify the listing and start the
                acquisition process.
              </p>

              {listing.asking_price != null && (
                <div className="mt-4 rounded-lg bg-green-50 border border-green-100 px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 uppercase tracking-wide font-medium">
                    <DollarSign className="h-3 w-3" />
                    Asking Price
                  </div>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(listing.asking_price)}
                  </p>
                </div>
              )}

              <a
                href={`mailto:james@apexaivending.com?subject=${encodeURIComponent(
                  `Machine Inquiry: ${listing.title}`
                )}&body=${encodeURIComponent(
                  `Hi,\n\nI'm interested in the machine listing "${listing.title}" in ${listing.city}, ${listing.state}.\n\nListing ID: ${listing.id}\n\nPlease share more details.\n\nThank you`
                )}`}
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
                {conditionLabel && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Condition</span>
                    <span className="font-medium text-black-primary">
                      {conditionLabel}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Quantity</span>
                  <span className="font-medium text-black-primary">
                    {listing.quantity}
                  </span>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-gradient-to-br from-green-50 to-light-warm rounded-xl border border-green-100 p-5">
              <h4 className="text-sm font-semibold text-black-primary mb-2">
                How machine sales work
              </h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Browse used and refurbished vending machines from operators.
                Contact the admin to verify condition, inspect the machine, and
                negotiate terms through Vending Connector.
              </p>
              <Link
                href="/machines-for-sale"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-green-primary hover:text-green-hover transition-colors"
              >
                Browse All Machines
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Similar */}
        {(loadingSimilar || similar.length > 0) && (
          <section className="mt-12">
            <h2 className="text-lg font-bold text-black-primary mb-5">
              More Machines for Sale
            </h2>

            {loadingSimilar && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading similar machines...
              </div>
            )}

            {!loadingSimilar && similar.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {similar.map((m) => (
                  <SimilarMachineCard key={m.id} listing={m} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
