"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  MessageSquare,
  Plus,
  ChevronRight,
  Loader2,
  LogIn,
  UserPlus,
  ArrowRight,
  MapPin,
  Building2,
  User,
  LogOut,
  Star,
  BadgeCheck,
  Monitor,
  Users,
  Clock,
  HandCoins,
  Settings,
} from "lucide-react";
import type {
  Profile,
  VendingRequest,
  OperatorListing,
  MachineType,
} from "@/lib/types";
import { MACHINE_TYPES } from "@/lib/types";
import { createBrowserClient } from "@/lib/supabase";
import LocationTypeIcon from "@/app/components/LocationTypeIcon";
import MachineTypeBadge from "@/app/components/MachineTypeBadge";
import UrgencyBadge from "@/app/components/UrgencyBadge";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function daysAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function machineLabel(type: string): string {
  return MACHINE_TYPES.find((mt) => mt.value === type)?.label ?? type;
}

/* ------------------------------------------------------------------ */
/*  Skeleton Loaders                                                   */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="skeleton mb-3 h-5 w-3/4" />
      <div className="skeleton mb-2 h-4 w-1/2" />
      <div className="flex gap-2 mt-3">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="skeleton mt-4 h-4 w-1/3" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Operator with profile                                              */
/* ------------------------------------------------------------------ */

interface OperatorWithProfile extends OperatorListing {
  profiles?: Profile;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  /* ---- Auth ---- */
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [notLoggedIn, setNotLoggedIn] = useState(false);

  /* ---- Data ---- */
  const [requests, setRequests] = useState<VendingRequest[]>([]);
  const [operators, setOperators] = useState<OperatorWithProfile[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingOperators, setLoadingOperators] = useState(false);

  /* ============================================================== */
  /*  Auth                                                           */
  /* ============================================================== */

  useEffect(() => {
    const supabase = createBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED"
      ) {
        if (!session) {
          setNotLoggedIn(true);
          setAuthLoading(false);
          return;
        }

        try {
          const res = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (!res.ok) {
            setNotLoggedIn(true);
            setAuthLoading(false);
            return;
          }
          const data = await res.json();
          setProfile(data);
        } catch {
          setNotLoggedIn(true);
        } finally {
          setAuthLoading(false);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  /* ============================================================== */
  /*  Fetch preview data                                             */
  /* ============================================================== */

  const fetchRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const res = await fetch("/api/requests?limit=4&status=open");
      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      /* noop */
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const fetchOperators = useCallback(async () => {
    setLoadingOperators(true);
    try {
      const res = await fetch("/api/operators?limit=4");
      const data = await res.json();
      setOperators(data.listings || []);
    } catch {
      /* noop */
    } finally {
      setLoadingOperators(false);
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    fetchRequests();
    fetchOperators();
  }, [profile, fetchRequests, fetchOperators]);

  /* ============================================================== */
  /*  Sign Out                                                       */
  /* ============================================================== */

  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  /* ============================================================== */
  /*  Loading state                                                  */
  /* ============================================================== */

  if (authLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 space-y-3">
          <div className="skeleton h-8 w-48" />
          <div className="skeleton h-5 w-64" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  /* ============================================================== */
  /*  Not logged in                                                  */
  /* ============================================================== */

  if (notLoggedIn || !profile) {
    return (
      <div className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50">
            <LogIn className="h-8 w-8 text-green-primary" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-black-primary">
            Sign in to your Dashboard
          </h1>
          <p className="mb-8 text-black-primary/50">
            Please log in or create an account to access your VendHub dashboard.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover sm:w-auto"
            >
              <LogIn className="h-4 w-4" />
              Log In
            </Link>
            <Link
              href="/signup"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-black-primary transition-colors hover:border-green-200 hover:bg-green-50 sm:w-auto"
            >
              <UserPlus className="h-4 w-4" />
              Create Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ============================================================== */
  /*  Authenticated Dashboard                                        */
  /* ============================================================== */

  const firstName = profile.full_name?.split(" ")[0] || "there";
  const isOperator = profile.role === "operator";

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      {/* ------- WELCOME HEADER ------- */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-black-primary sm:text-4xl">
                Welcome, {firstName}
              </h1>
              <p className="mt-2 text-lg text-black-primary/50">
                Explore available listings and open requests on the platform.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-light-warm px-3 py-1.5 text-xs font-medium text-black-primary">
                {isOperator ? (
                  <>
                    <Building2 className="h-3.5 w-3.5 text-green-primary" />{" "}
                    Operator
                  </>
                ) : profile.role === "location_manager" ? (
                  <>
                    <MapPin className="h-3.5 w-3.5 text-green-primary" />{" "}
                    Location Manager
                  </>
                ) : (
                  <>
                    <User className="h-3.5 w-3.5 text-green-primary" />{" "}
                    Requestor
                  </>
                )}
              </span>
              <Link
                href="/dashboard/profile"
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-black-primary/60 transition-colors hover:border-green-200 hover:bg-green-50 hover:text-green-primary"
              >
                <Settings className="h-3.5 w-3.5" />
                Edit Profile
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-black-primary/60 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">
        {/* ------- QUICK ACTIONS ------- */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isOperator ? (
            <>
              <Link
                href="/browse-requests"
                className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-100 hover:shadow-md"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-primary transition-colors group-hover:bg-green-primary group-hover:text-white">
                  <Search className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-black-primary">
                    Browse Requests
                  </p>
                  <p className="text-sm text-black-primary/50">
                    Find locations looking for vending machines
                  </p>
                </div>
                <ChevronRight className="ml-auto h-5 w-5 text-black-primary/20 transition-colors group-hover:text-green-primary" />
              </Link>
              <Link
                href="/listings/new"
                className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-100 hover:shadow-md"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                  <Plus className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-black-primary">
                    Create Listing
                  </p>
                  <p className="text-sm text-black-primary/50">
                    Advertise your vending services
                  </p>
                </div>
                <ChevronRight className="ml-auto h-5 w-5 text-black-primary/20 transition-colors group-hover:text-blue-600" />
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/post-request"
                className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-100 hover:shadow-md"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-primary transition-colors group-hover:bg-green-primary group-hover:text-white">
                  <Plus className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-black-primary">
                    Post a Request
                  </p>
                  <p className="text-sm text-black-primary/50">
                    Let operators know you need a vending machine
                  </p>
                </div>
                <ChevronRight className="ml-auto h-5 w-5 text-black-primary/20 transition-colors group-hover:text-green-primary" />
              </Link>
              <Link
                href="/browse-operators"
                className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-100 hover:shadow-md"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                  <Search className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-black-primary">
                    Browse Operators
                  </p>
                  <p className="text-sm text-black-primary/50">
                    Find vending operators in your area
                  </p>
                </div>
                <ChevronRight className="ml-auto h-5 w-5 text-black-primary/20 transition-colors group-hover:text-blue-600" />
              </Link>
            </>
          )}
          <Link
            href="/messages"
            className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-100 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 transition-colors group-hover:bg-purple-600 group-hover:text-white">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-black-primary">Messages</p>
              <p className="text-sm text-black-primary/50">
                View your conversations
              </p>
            </div>
            <ChevronRight className="ml-auto h-5 w-5 text-black-primary/20 transition-colors group-hover:text-purple-600" />
          </Link>
        </div>

        {/* ------- RECENT REQUESTS ------- */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-black-primary">
                Open Requests
              </h2>
              <p className="mt-1 text-sm text-black-primary/50">
                Locations looking for vending machines
              </p>
            </div>
            <Link
              href="/browse-requests"
              className="inline-flex items-center gap-1 text-sm font-medium text-green-primary hover:text-green-hover transition-colors"
            >
              View All
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {loadingRequests ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 px-6 py-12 text-center">
              <MapPin className="mx-auto mb-3 h-8 w-8 text-black-primary/20" />
              <p className="text-sm font-medium text-black-primary/50">
                No open requests right now
              </p>
              <p className="mt-1 text-xs text-black-primary/30">
                Check back soon for new locations
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {requests.slice(0, 4).map((req) => (
                <Link
                  key={req.id}
                  href={`/requests/${req.id}`}
                  className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-green-100 hover:shadow-md"
                >
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <LocationTypeIcon type={req.location_type} size="md" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-black-primary text-sm leading-snug line-clamp-2 group-hover:text-green-primary transition-colors">
                        {req.title}
                      </h3>
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {req.city}, {req.state}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Machine types */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {req.machine_types_wanted.slice(0, 2).map((mt) => (
                      <MachineTypeBadge key={mt} type={mt} size="sm" />
                    ))}
                    {req.machine_types_wanted.length > 2 && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        +{req.machine_types_wanted.length - 2}
                      </span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mb-3">
                    {req.estimated_daily_traffic !== null && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {req.estimated_daily_traffic.toLocaleString()}/day
                      </span>
                    )}
                    {req.commission_offered && (
                      <span className="flex items-center gap-1 text-green-600">
                        <HandCoins className="w-3 h-3" />
                        Commission
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                    <UrgencyBadge urgency={req.urgency} />
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      {daysAgo(req.created_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ------- FEATURED OPERATORS ------- */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-black-primary">
                Featured Operators
              </h2>
              <p className="mt-1 text-sm text-black-primary/50">
                Vending operators ready to serve your location
              </p>
            </div>
            <Link
              href="/browse-operators"
              className="inline-flex items-center gap-1 text-sm font-medium text-green-primary hover:text-green-hover transition-colors"
            >
              View All
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {loadingOperators ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : operators.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 px-6 py-12 text-center">
              <Building2 className="mx-auto mb-3 h-8 w-8 text-black-primary/20" />
              <p className="text-sm font-medium text-black-primary/50">
                No operator listings yet
              </p>
              <p className="mt-1 text-xs text-black-primary/30">
                Check back soon for new operators
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {operators.slice(0, 4).map((op) => {
                const opProfile = op.profiles;
                const initials = opProfile?.full_name
                  ?.split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "?";

                return (
                  <Link
                    key={op.id}
                    href={`/operators/${op.operator_id}`}
                    className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-green-100 hover:shadow-md"
                  >
                    {/* Operator header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-primary text-sm font-bold text-white">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-black-primary truncate group-hover:text-green-primary transition-colors">
                          {op.title}
                        </p>
                        {opProfile?.company_name && (
                          <p className="text-xs text-gray-500 truncate">
                            {opProfile.company_name}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Machine types */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(op.machine_types as string[]).slice(0, 2).map((mt) => (
                        <MachineTypeBadge key={mt} type={mt} size="sm" />
                      ))}
                      {op.machine_types.length > 2 && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          +{op.machine_types.length - 2}
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="space-y-1.5 text-xs text-gray-500 mb-3">
                      <div className="flex items-center gap-1.5">
                        <Monitor className="w-3 h-3 shrink-0" />
                        <span>
                          {op.machine_count_available} machine
                          {op.machine_count_available !== 1 ? "s" : ""}{" "}
                          available
                        </span>
                      </div>
                      {op.states_served.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {op.states_served.slice(0, 3).join(", ")}
                            {op.states_served.length > 3 &&
                              ` +${op.states_served.length - 3}`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                      {opProfile?.rating && opProfile.rating > 0 ? (
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className="text-xs font-medium text-black-primary">
                            {opProfile.rating.toFixed(1)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">New</span>
                      )}
                      {op.accepts_commission && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-inset ring-green-200">
                          Commission OK
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
