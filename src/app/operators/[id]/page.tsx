"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  BadgeCheck,
  Star,
  Users,
  Award,
  Monitor,
  MessageSquare,
  Loader2,
  AlertCircle,
  Globe,
  Phone,
  Mail,
  Compass,
  Clock,
  Eye,
  HandCoins,
} from "lucide-react";
import type { Profile, OperatorListing, Review } from "@/lib/types";
import MachineTypeBadge from "../../components/MachineTypeBadge";
import StarRating from "../../components/StarRating";

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Avatar with initials fallback */
function AvatarCircle({
  name,
  avatarUrl,
  size = "lg",
}: {
  name: string;
  avatarUrl: string | null;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-16 w-16 text-lg",
    xl: "h-24 w-24 text-2xl",
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
        className={`${sizeClasses[size]} rounded-full object-cover ring-4 ring-green-100`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} flex items-center justify-center rounded-full bg-green-primary font-bold text-white ring-4 ring-green-100`}
    >
      {initials}
    </div>
  );
}

/** Status badge for listing */
function ListingStatusBadge({ status }: { status: string }) {
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
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

/** Stat card */
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-50 border border-gray-100 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-primary shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
          {label}
        </p>
        <p className="text-lg font-bold text-black-primary">{value}</p>
      </div>
    </div>
  );
}

/** Active listing card */
function ListingCard({ listing }: { listing: OperatorListing }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 transition-shadow hover:shadow-lg hover:shadow-green-primary/5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold text-black-primary text-sm leading-snug truncate">
            {listing.title}
          </h4>
          {listing.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
              {listing.description}
            </p>
          )}
        </div>
        <ListingStatusBadge status={listing.status} />
      </div>

      {/* Machine Types */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {listing.machine_types.map((mt) => (
          <MachineTypeBadge key={mt} type={mt} size="sm" />
        ))}
      </div>

      {/* Details */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Monitor className="h-3 w-3" />
          <span className="font-medium text-black-primary">
            {listing.machine_count_available}
          </span>{" "}
          machines
        </span>
        <span className="flex items-center gap-1">
          <Compass className="h-3 w-3" />
          {listing.service_radius_miles} mi radius
        </span>
        {listing.accepts_commission && (
          <span className="flex items-center gap-1">
            <HandCoins className="h-3 w-3" />
            <span className="text-green-600 font-medium">Commission OK</span>
          </span>
        )}
      </div>

      {/* Locations served */}
      {(listing.cities_served.length > 0 ||
        listing.states_served.length > 0) && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {listing.cities_served.length > 0
              ? listing.cities_served.slice(0, 3).join(", ")
              : ""}
            {listing.cities_served.length > 0 &&
            listing.states_served.length > 0
              ? " | "
              : ""}
            {listing.states_served.join(", ")}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(listing.created_at)}
        </span>
        <span className="flex items-center gap-1">
          <Eye className="h-3 w-3" />
          {listing.views} views
        </span>
      </div>
    </div>
  );
}

/** Review card */
function ReviewCard({ review }: { review: Review }) {
  const reviewer = review.reviewer as
    | { id: string; full_name: string; avatar_url: string | null }
    | undefined;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start gap-3">
        <AvatarCircle
          name={reviewer?.full_name ?? "Anonymous"}
          avatarUrl={reviewer?.avatar_url ?? null}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-black-primary text-sm truncate">
              {reviewer?.full_name ?? "Anonymous"}
            </p>
            <span className="text-xs text-gray-400 shrink-0">
              {timeAgo(review.created_at)}
            </span>
          </div>
          <div className="mt-1">
            <StarRating value={review.rating} size="sm" />
          </div>
          {review.comment && (
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              {review.comment}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Loading skeleton for profile page */
function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-light">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="skeleton h-4 w-36 mb-8" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Profile header skeleton */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-5">
                <div className="skeleton h-24 w-24 rounded-full" />
                <div className="flex-1 space-y-3">
                  <div className="skeleton h-6 w-1/2" />
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton h-4 w-2/3" />
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="skeleton h-16 rounded-lg" />
                <div className="skeleton h-16 rounded-lg" />
                <div className="skeleton h-16 rounded-lg" />
                <div className="skeleton h-16 rounded-lg" />
              </div>
            </div>
            {/* Listings skeleton */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="skeleton h-5 w-32 mb-4" />
              <div className="space-y-4">
                <div className="skeleton h-32 rounded-lg" />
                <div className="skeleton h-32 rounded-lg" />
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="skeleton h-5 w-48 mb-4" />
              <div className="skeleton h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function OperatorProfilePage() {
  const params = useParams();
  const id = params.id as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<OperatorListing[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingListings, setLoadingListings] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Fetch profile
  useEffect(() => {
    if (!id) return;

    async function fetchProfile() {
      setLoading(true);
      setError(null);

      try {
        // Fetch operator profile via the profiles mode
        const params = new URLSearchParams();
        params.set("mode", "profiles");
        params.set("search", "");
        params.set("page", "0");

        const res = await fetch(`/api/operators?${params}`);
        if (!res.ok) throw new Error("Failed to fetch operators");

        const data = await res.json();
        const operators: Profile[] = data.operators ?? [];
        const found = operators.find((op) => op.id === id);

        if (!found) {
          setError("Operator not found");
          return;
        }

        setProfile(found);
      } catch {
        setError("Failed to load operator profile. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [id]);

  // Fetch listings
  useEffect(() => {
    if (!id) return;

    async function fetchListings() {
      setLoadingListings(true);
      try {
        const params = new URLSearchParams();
        params.set("mine", "true");
        params.set("user_id", id);
        params.set("page", "0");

        const res = await fetch(`/api/operators?${params}`);
        if (res.ok) {
          const data = await res.json();
          setListings(data.listings ?? []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoadingListings(false);
      }
    }

    fetchListings();
  }, [id]);

  // Fetch reviews
  useEffect(() => {
    if (!id) return;

    async function fetchReviews() {
      setLoadingReviews(true);
      try {
        const res = await fetch(`/api/reviews?user_id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setReviews(Array.isArray(data) ? data : []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoadingReviews(false);
      }
    }

    fetchReviews();
  }, [id]);

  // ---------- Loading state ----------
  if (loading) return <ProfileSkeleton />;

  // ---------- Error state ----------
  if (error || !profile) {
    return (
      <div className="min-h-screen bg-light">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-black-primary">
              {error || "Operator not found"}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              The operator profile you are looking for may have been removed or
              does not exist.
            </p>
            <Link
              href="/browse-operators"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-hover"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Browse Operators
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Aggregate data from listings
  const allMachineTypes = new Set<string>();
  const allCities = new Set<string>();
  const allStates = new Set<string>();
  let totalMachines = 0;
  let maxRadius = 0;

  for (const listing of listings) {
    for (const mt of listing.machine_types) allMachineTypes.add(mt);
    for (const c of listing.cities_served) allCities.add(c);
    for (const s of listing.states_served) allStates.add(s);
    totalMachines += listing.machine_count_available;
    if (listing.service_radius_miles > maxRadius)
      maxRadius = listing.service_radius_miles;
  }

  // Add profile-level city/state if available
  if (profile.city) allCities.add(profile.city);
  if (profile.state) allStates.add(profile.state);

  const memberSince = formatDate(profile.created_at);

  return (
    <div className="min-h-screen bg-light">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/browse-operators"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-green-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Browse Operators
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* ---------------------------------------------------------------- */}
          {/* Main content */}
          {/* ---------------------------------------------------------------- */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Header Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 animate-fade-in">
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                <AvatarCircle
                  name={profile.full_name}
                  avatarUrl={profile.avatar_url}
                  size="xl"
                />
                <div className="text-center sm:text-left min-w-0 flex-1">
                  <div className="flex items-center justify-center gap-2 sm:justify-start">
                    <h1 className="text-xl font-bold text-black-primary sm:text-2xl">
                      {profile.full_name}
                    </h1>
                    {profile.verified && (
                      <BadgeCheck className="h-5 w-5 shrink-0 text-green-primary" />
                    )}
                  </div>
                  {profile.company_name && (
                    <p className="mt-0.5 text-sm text-gray-500">
                      {profile.company_name}
                    </p>
                  )}
                  {(profile.city || profile.state) && (
                    <p className="mt-1 flex items-center justify-center gap-1 text-sm text-gray-500 sm:justify-start">
                      <MapPin className="h-3.5 w-3.5" />
                      {[profile.city, profile.state]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}

                  {/* Contact links */}
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                    {profile.website && (
                      <a
                        href={profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-green-primary transition-colors"
                      >
                        <Globe className="h-3 w-3" />
                        Website
                      </a>
                    )}
                    {profile.phone && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <Phone className="h-3 w-3" />
                        {profile.phone}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Mail className="h-3 w-3" />
                      {profile.email}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-gray-400">
                    Member since {memberSince}
                  </p>
                </div>
              </div>

              {/* Bio */}
              {profile.bio && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-black-primary mb-2">
                    About
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {profile.bio}
                  </p>
                </div>
              )}

              {/* Stats Row */}
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  icon={Star}
                  label="Rating"
                  value={profile.rating.toFixed(1)}
                />
                <StatCard
                  icon={Users}
                  label="Reviews"
                  value={profile.review_count}
                />
                <StatCard
                  icon={Award}
                  label="Listings"
                  value={listings.length}
                />
                <StatCard
                  icon={Monitor}
                  label="Machines"
                  value={totalMachines}
                />
              </div>
            </div>

            {/* Service Area */}
            {(allCities.size > 0 ||
              allStates.size > 0 ||
              maxRadius > 0) && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 animate-fade-in">
                <h3 className="text-base font-bold text-black-primary mb-4 flex items-center gap-2">
                  <Compass className="h-5 w-5 text-green-primary" />
                  Service Area
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {allStates.size > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">
                        States Served
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(allStates).map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-primary ring-1 ring-inset ring-green-200"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {allCities.size > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">
                        Cities Served
                      </p>
                      <p className="text-sm text-black-primary">
                        {Array.from(allCities).slice(0, 8).join(", ")}
                        {allCities.size > 8 && (
                          <span className="text-gray-400">
                            {" "}
                            +{allCities.size - 8} more
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                  {maxRadius > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">
                        Service Radius
                      </p>
                      <p className="text-sm font-medium text-black-primary">
                        Up to {maxRadius} miles
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Machine Types */}
            {allMachineTypes.size > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 animate-fade-in">
                <h3 className="text-base font-bold text-black-primary mb-4 flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-green-primary" />
                  Machine Types Offered
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Array.from(allMachineTypes).map((mt) => (
                    <MachineTypeBadge key={mt} type={mt} size="md" />
                  ))}
                </div>
              </div>
            )}

            {/* Active Listings */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-fade-in">
              <h3 className="text-base font-bold text-black-primary mb-4 flex items-center gap-2">
                <Monitor className="h-5 w-5 text-green-primary" />
                Active Listings
                {listings.length > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-primary px-1.5 text-[11px] font-bold text-white">
                    {listings.length}
                  </span>
                )}
              </h3>

              {loadingListings && (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading listings...
                </div>
              )}

              {!loadingListings && listings.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
                  <Monitor className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    No active listings at the moment.
                  </p>
                </div>
              )}

              {!loadingListings && listings.length > 0 && (
                <div className="space-y-4">
                  {listings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
              )}
            </div>

            {/* Reviews */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-fade-in">
              <h3 className="text-base font-bold text-black-primary mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-green-primary" />
                Reviews
                {reviews.length > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-primary px-1.5 text-[11px] font-bold text-white">
                    {reviews.length}
                  </span>
                )}
              </h3>

              {loadingReviews && (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading reviews...
                </div>
              )}

              {!loadingReviews && reviews.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
                  <Star className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    No reviews yet. Be the first to work with this operator!
                  </p>
                </div>
              )}

              {!loadingReviews && reviews.length > 0 && (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <ReviewCard key={review.id} review={review} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Sidebar */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-6">
            {/* Contact Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24 animate-fade-in">
              <h3 className="text-lg font-bold text-black-primary">
                Contact This Operator
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Reach out to discuss vending machine placement at your location.
              </p>

              <button
                type="button"
                onClick={() =>
                  alert("Sign up to send messages to operators!")
                }
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
              >
                <MessageSquare className="h-4 w-4" />
                Send Message
              </button>

              <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Rating</span>
                  <div className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-green-primary text-green-primary" />
                    <span className="font-semibold text-black-primary">
                      {profile.rating.toFixed(1)}
                    </span>
                    <span className="text-gray-400">
                      ({profile.review_count})
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Active Listings</span>
                  <span className="font-semibold text-black-primary">
                    {listings.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Machines Available</span>
                  <span className="font-semibold text-black-primary">
                    {totalMachines}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Verified</span>
                  {profile.verified ? (
                    <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Yes
                    </span>
                  ) : (
                    <span className="text-gray-400">No</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Member Since</span>
                  <span className="font-medium text-black-primary">{memberSince}</span>
                </div>
              </div>
            </div>

            {/* Browse CTA */}
            <div className="bg-gradient-to-br from-green-50 to-light-warm rounded-xl border border-green-100 p-5">
              <h4 className="text-sm font-semibold text-black-primary mb-2">
                Looking for a location?
              </h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Browse open vending requests from locations looking for
                operators like you.
              </p>
              <Link
                href="/browse-requests"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-green-primary hover:text-green-hover transition-colors"
              >
                Browse Requests
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
