"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Users,
  HandCoins,
  Clock,
  Eye,
  Mail,
  Phone,
  MessageSquare,
  BadgeCheck,
  Star,
  Loader2,
  AlertCircle,
  Send,
  ArrowRight,
} from "lucide-react";
import type { VendingRequest, Profile } from "@/lib/types";
import { LOCATION_TYPES } from "@/lib/types";
import MachineTypeBadge from "../../components/MachineTypeBadge";
import UrgencyBadge from "../../components/UrgencyBadge";
import LocationTypeIcon from "../../components/LocationTypeIcon";

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
  const now = new Date();
  const created = new Date(dateStr);
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  const months = Math.floor(diffDays / 30);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

function getContactPreferenceDisplay(pref: string): {
  label: string;
  icon: React.ElementType;
} {
  switch (pref) {
    case "email":
      return { label: "Email", icon: Mail };
    case "phone":
      return { label: "Phone", icon: Phone };
    case "platform_message":
    default:
      return { label: "Platform Message", icon: MessageSquare };
  }
}

function getStatusConfig(status: string): {
  bg: string;
  text: string;
  ring: string;
  label: string;
} {
  switch (status) {
    case "open":
      return {
        bg: "bg-green-50",
        text: "text-green-700",
        ring: "ring-green-200",
        label: "Open",
      };
    case "matched":
      return {
        bg: "bg-amber-50",
        text: "text-amber-700",
        ring: "ring-amber-200",
        label: "Matched",
      };
    case "closed":
      return {
        bg: "bg-slate-50",
        text: "text-slate-600",
        ring: "ring-slate-200",
        label: "Closed",
      };
    default:
      return {
        bg: "bg-gray-50",
        text: "text-gray-600",
        ring: "ring-gray-200",
        label: status,
      };
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Avatar with initials fallback */
function AvatarCircle({
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
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-base",
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

/** Loading skeleton for the request detail */
function DetailSkeleton() {
  return (
    <div className="min-h-screen bg-cream">
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
                <div className="skeleton h-6 w-14 rounded-full" />
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

/** Similar request card (compact) */
function SimilarRequestCard({ request }: { request: VendingRequest }) {
  return (
    <Link
      href={`/requests/${request.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 transition-shadow hover:shadow-lg hover:shadow-orange-primary/5 group"
    >
      <div className="flex items-start gap-3">
        <LocationTypeIcon type={request.location_type} size="sm" />
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-navy text-sm leading-snug truncate group-hover:text-orange-primary transition-colors">
            {request.title}
          </h4>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {request.city}, {request.state}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {request.machine_types_wanted.slice(0, 3).map((mt) => (
          <MachineTypeBadge key={mt} type={mt} size="sm" />
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
        <UrgencyBadge urgency={request.urgency} />
        <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-primary">
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

export default function RequestDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [request, setRequest] = useState<VendingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [similarRequests, setSimilarRequests] = useState<VendingRequest[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  // Fetch main request
  useEffect(() => {
    if (!id) return;

    async function fetchRequest() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/requests/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Request not found");
          } else {
            setError("Failed to load request");
          }
          return;
        }

        const data = await res.json();
        setRequest(data);
      } catch {
        setError("Failed to load request. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    fetchRequest();
  }, [id]);

  // Fetch similar requests
  useEffect(() => {
    if (!request) return;

    async function fetchSimilar() {
      setLoadingSimilar(true);
      try {
        const params = new URLSearchParams();
        params.set("state", request!.state);
        params.set("per_page", "4");
        params.set("page", "0");

        const res = await fetch(`/api/requests?${params}`);
        if (res.ok) {
          const data = await res.json();
          const items: VendingRequest[] = data.requests ?? data.data ?? [];
          // Filter out the current request
          const filtered = items
            .filter((r) => r.id !== request!.id)
            .slice(0, 3);
          setSimilarRequests(filtered);
        }
      } catch {
        // Silently fail for similar requests
      } finally {
        setLoadingSimilar(false);
      }
    }

    fetchSimilar();
  }, [request]);

  // ---------- Loading state ----------
  if (loading) return <DetailSkeleton />;

  // ---------- Error state ----------
  if (error || !request) {
    return (
      <div className="min-h-screen bg-cream">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-navy">
              {error || "Request not found"}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              The request you are looking for may have been removed or does not
              exist.
            </p>
            <Link
              href="/browse-requests"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-orange-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-hover"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Browse Requests
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const profile = request.profiles as Profile | undefined;
  const statusConfig = getStatusConfig(request.status);
  const locationLabel =
    LOCATION_TYPES.find((lt) => lt.value === request.location_type)?.label ??
    request.location_type;
  const contactPref = getContactPreferenceDisplay(request.contact_preference);
  const ContactIcon = contactPref.icon;

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/browse-requests"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-orange-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Browse Requests
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* ---------------------------------------------------------------- */}
          {/* Main content */}
          {/* ---------------------------------------------------------------- */}
          <div className="lg:col-span-2 space-y-6">
            {/* Request card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 animate-fade-in">
              {/* Header */}
              <div className="flex items-start gap-4">
                <LocationTypeIcon type={request.location_type} size="lg" />
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold text-navy sm:text-2xl leading-tight">
                    {request.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full ring-1 ring-inset ${statusConfig.bg} ${statusConfig.text} ${statusConfig.ring}`}
                    >
                      {statusConfig.label}
                    </span>
                    <UrgencyBadge urgency={request.urgency} />
                  </div>
                </div>
              </div>

              {/* Description */}
              {request.description && (
                <div className="mt-6">
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {request.description}
                  </p>
                </div>
              )}

              {/* Location Info */}
              <div className="mt-6 rounded-lg bg-cream border border-orange-100 p-4">
                <h3 className="text-sm font-semibold text-navy mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-orange-primary" />
                  Location Details
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                      Location Name
                    </p>
                    <p className="text-sm font-medium text-navy mt-0.5">
                      {request.location_name}
                    </p>
                  </div>
                  {request.address && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Address
                      </p>
                      <p className="text-sm font-medium text-navy mt-0.5">
                        {request.address}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                      City / State
                    </p>
                    <p className="text-sm font-medium text-navy mt-0.5">
                      {request.city}, {request.state}
                      {request.zip ? ` ${request.zip}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                      Location Type
                    </p>
                    <p className="text-sm font-medium text-navy mt-0.5 flex items-center gap-1.5">
                      <LocationTypeIcon
                        type={request.location_type}
                        size="sm"
                      />
                      {locationLabel}
                    </p>
                  </div>
                </div>
              </div>

              {/* Machine Types */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-navy mb-2">
                  Machine Types Wanted
                </h3>
                <div className="flex flex-wrap gap-2">
                  {request.machine_types_wanted.map((mt) => (
                    <MachineTypeBadge key={mt} type={mt} size="md" />
                  ))}
                </div>
              </div>

              {/* Details Grid */}
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Daily Traffic */}
                {request.estimated_daily_traffic !== null && (
                  <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                      <Users className="h-3.5 w-3.5" />
                      Estimated Daily Traffic
                    </div>
                    <p className="mt-1 text-lg font-bold text-navy">
                      {request.estimated_daily_traffic.toLocaleString()}
                      <span className="text-sm font-normal text-gray-500 ml-1">
                        people / day
                      </span>
                    </p>
                  </div>
                )}

                {/* Commission */}
                <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                    <HandCoins className="h-3.5 w-3.5" />
                    Commission
                  </div>
                  <p className="mt-1">
                    {request.commission_offered ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        Commission Offered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500">
                        <span className="h-2 w-2 rounded-full bg-gray-400" />
                        No Commission
                      </span>
                    )}
                  </p>
                  {request.commission_notes && (
                    <p className="mt-1.5 text-xs text-gray-500 italic">
                      {request.commission_notes}
                    </p>
                  )}
                </div>

                {/* Contact Preference */}
                <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                    <ContactIcon className="h-3.5 w-3.5" />
                    Preferred Contact
                  </div>
                  <p className="mt-1 text-sm font-semibold text-navy">
                    {contactPref.label}
                  </p>
                </div>

                {/* Views */}
                <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
                    <Eye className="h-3.5 w-3.5" />
                    Views
                  </div>
                  <p className="mt-1 text-lg font-bold text-navy">
                    {request.views.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Posted By */}
              {profile && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-navy mb-3">
                    Posted By
                  </h3>
                  <div className="flex items-center gap-3">
                    <AvatarCircle
                      name={profile.full_name}
                      avatarUrl={profile.avatar_url}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-navy text-sm truncate">
                          {profile.full_name}
                        </p>
                        {profile.verified && (
                          <BadgeCheck className="h-4 w-4 shrink-0 text-orange-primary" />
                        )}
                      </div>
                      {profile.company_name && (
                        <p className="text-xs text-gray-500 truncate">
                          {profile.company_name}
                        </p>
                      )}
                    </div>
                    <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
                      <Star className="h-3.5 w-3.5 fill-orange-primary text-orange-primary" />
                      <span className="font-medium text-navy">
                        {profile.rating.toFixed(1)}
                      </span>
                      <span>({profile.review_count})</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Posted {formatDate(request.created_at)} ({timeAgo(request.created_at)})
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {request.views.toLocaleString()} views
                </span>
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Sidebar */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-6">
            {/* CTA Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24 animate-fade-in">
              <h3 className="text-lg font-bold text-navy">
                Interested in this location?
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Connect with the requestor and start the placement process.
              </p>

              <button
                type="button"
                onClick={() =>
                  alert(
                    "Sign up as an operator to apply for vending placement requests!"
                  )
                }
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-hover"
              >
                <Send className="h-4 w-4" />
                Apply as Operator
              </button>

              <button
                type="button"
                onClick={() =>
                  alert("Sign up to send messages to requestors!")
                }
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-orange-50 hover:border-orange-primary/40"
              >
                <MessageSquare className="h-4 w-4" />
                Send Message
              </button>

              <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Status</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ring-1 ring-inset ${statusConfig.bg} ${statusConfig.text} ${statusConfig.ring}`}
                  >
                    {statusConfig.label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Urgency</span>
                  <UrgencyBadge urgency={request.urgency} />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Commission</span>
                  <span className="font-medium text-navy">
                    {request.commission_offered ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick info card */}
            <div className="bg-gradient-to-br from-orange-50 to-peach rounded-xl border border-orange-100 p-5">
              <h4 className="text-sm font-semibold text-navy mb-2">
                New to VendHub?
              </h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                VendHub connects locations that need vending machines with
                operators ready to serve. Sign up for free and start matching
                with the right partners.
              </p>
              <Link
                href="/signup"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-orange-primary hover:text-orange-hover transition-colors"
              >
                Get Started
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Similar Requests */}
        {/* ------------------------------------------------------------------ */}
        {(loadingSimilar || similarRequests.length > 0) && (
          <section className="mt-12">
            <h2 className="text-lg font-bold text-navy mb-5">
              Similar Requests Nearby
            </h2>

            {loadingSimilar && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading similar requests...
              </div>
            )}

            {!loadingSimilar && similarRequests.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {similarRequests.map((req) => (
                  <SimilarRequestCard key={req.id} request={req} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
