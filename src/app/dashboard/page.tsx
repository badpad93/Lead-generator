"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  FileText,
  Search,
  List,
  Heart,
  MessageSquare,
  User,
  Plus,
  Eye,
  Calendar,
  MapPin,
  Building2,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  Wrench,
  Star,
  Loader2,
  LogIn,
  UserPlus,
  ArrowRight,
  Edit3,
  Trash2,
  ExternalLink,
  Save,
  Users,
  TrendingUp,
  Handshake,
  Inbox,
} from "lucide-react";
import type {
  Profile,
  VendingRequest,
  OperatorListing,
  Match,
  MatchStatus,
  RequestStatus,
} from "@/lib/types";
import { getAccessToken } from "@/lib/auth";
import LocationTypeIcon from "@/app/components/LocationTypeIcon";
import StarRating from "@/app/components/StarRating";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type OperatorTab =
  | "applications"
  | "browse"
  | "listings"
  | "saved"
  | "messages"
  | "profile";

type ManagerTab = "requests" | "matches" | "messages" | "profile";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function authHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(iso);
}

/* ------------------------------------------------------------------ */
/*  Status Badges                                                      */
/* ------------------------------------------------------------------ */

const matchStatusConfig: Record<
  MatchStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: {
    label: "Pending",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  accepted: {
    label: "Accepted",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-400",
  },
  declined: {
    label: "Declined",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-400",
  },
  installed: {
    label: "Installed",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-400",
  },
};

const requestStatusConfig: Record<
  RequestStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  open: {
    label: "Open",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-400",
  },
  matched: {
    label: "Matched",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  closed: {
    label: "Closed",
    bg: "bg-slate-50",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
};

function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const cfg = matchStatusConfig[status] || matchStatusConfig.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const cfg = requestStatusConfig[status] || requestStatusConfig.open;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Pipeline                                                    */
/* ------------------------------------------------------------------ */

const pipelineSteps: { key: MatchStatus; label: string; icon: typeof Clock }[] =
  [
    { key: "pending", label: "Pending", icon: Clock },
    { key: "accepted", label: "Accepted", icon: CheckCircle2 },
    { key: "installed", label: "Installed", icon: Wrench },
  ];

function StatusPipeline({ current }: { current: MatchStatus }) {
  if (current === "declined") {
    return (
      <div className="flex items-center gap-2 text-xs text-red-500">
        <XCircle className="h-4 w-4" />
        <span className="font-medium">Application Declined</span>
      </div>
    );
  }

  const currentIdx = pipelineSteps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-1">
      {pipelineSteps.map((step, idx) => {
        const Icon = step.icon;
        const isComplete = idx <= currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-1">
            {idx > 0 && (
              <div
                className={`h-0.5 w-6 rounded-full transition-colors ${
                  isComplete ? "bg-green-primary" : "bg-gray-200"
                }`}
              />
            )}
            <div
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                isCurrent
                  ? "bg-green-primary text-white"
                  : isComplete
                    ? "bg-green-100 text-green-primary"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              <Icon className="h-3 w-3" />
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton Loaders                                                   */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="skeleton mb-3 h-4 w-3/4" />
      <div className="skeleton mb-2 h-3 w-1/2" />
      <div className="skeleton h-3 w-1/3" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-50 bg-white p-4">
      <div className="skeleton h-10 w-10 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-3 w-1/3" />
      </div>
      <div className="skeleton h-6 w-16 rounded-full" />
    </div>
  );
}

function SkeletonStats() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
        >
          <div className="skeleton mb-3 h-10 w-10 rounded-xl" />
          <div className="skeleton mb-2 h-6 w-16" />
          <div className="skeleton h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty States                                                       */
/* ------------------------------------------------------------------ */

function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  href,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  cta?: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-primary">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mb-1.5 text-lg font-semibold text-black-primary">{title}</h3>
      <p className="mb-6 max-w-sm text-sm leading-relaxed text-black-primary/50">
        {description}
      </p>
      {cta && href && (
        <Link
          href={href}
          className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
        >
          {cta}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  color = "orange",
}: {
  icon: typeof FileText;
  label: string;
  value: number | string;
  color?: "orange" | "green" | "blue" | "purple";
}) {
  const colorMap = {
    orange: { bg: "bg-green-50", text: "text-green-primary" },
    green: { bg: "bg-emerald-50", text: "text-emerald-600" },
    blue: { bg: "bg-blue-50", text: "text-blue-600" },
    purple: { bg: "bg-purple-50", text: "text-purple-600" },
  };
  const c = colorMap[color];

  return (
    <div className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div
        className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${c.bg} ${c.text} transition-colors`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-black-primary">{value}</p>
      <p className="mt-0.5 text-sm text-black-primary/50">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab Button                                                         */
/* ------------------------------------------------------------------ */

function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof FileText;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${
        active
          ? "border-green-primary text-green-primary"
          : "border-transparent text-black-primary/50 hover:border-gray-200 hover:text-black-primary/80"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Profile Edit Form                                                  */
/* ------------------------------------------------------------------ */

function ProfileForm({
  profile,
  onSave,
  saving,
}: {
  profile: Profile;
  onSave: (updates: Partial<Profile>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    full_name: profile.full_name || "",
    company_name: profile.company_name || "",
    bio: profile.bio || "",
    phone: profile.phone || "",
    website: profile.website || "",
    city: profile.city || "",
    state: profile.state || "",
    zip: profile.zip || "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-2xl rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-primary text-lg font-bold text-white">
          {profile.full_name
            ?.split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "?"}
        </div>
        <div>
          <p className="font-semibold text-black-primary">{profile.full_name}</p>
          <p className="text-sm text-black-primary/50">{profile.email}</p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Full Name */}
        <div>
          <label
            htmlFor="full_name"
            className="mb-1.5 block text-sm font-medium text-black-primary"
          >
            Full Name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            value={form.full_name}
            onChange={handleChange}
            className="w-full"
          />
        </div>

        {/* Company */}
        <div>
          <label
            htmlFor="company_name"
            className="mb-1.5 block text-sm font-medium text-black-primary"
          >
            Company
          </label>
          <input
            id="company_name"
            name="company_name"
            type="text"
            value={form.company_name}
            onChange={handleChange}
            className="w-full"
          />
        </div>

        {/* Phone */}
        <div>
          <label
            htmlFor="phone"
            className="mb-1.5 block text-sm font-medium text-black-primary"
          >
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={handleChange}
            className="w-full"
          />
        </div>

        {/* Website */}
        <div>
          <label
            htmlFor="website"
            className="mb-1.5 block text-sm font-medium text-black-primary"
          >
            Website
          </label>
          <input
            id="website"
            name="website"
            type="text"
            value={form.website}
            onChange={handleChange}
            placeholder="https://"
            className="w-full"
          />
        </div>

        {/* City */}
        <div>
          <label
            htmlFor="city"
            className="mb-1.5 block text-sm font-medium text-black-primary"
          >
            City
          </label>
          <input
            id="city"
            name="city"
            type="text"
            value={form.city}
            onChange={handleChange}
            className="w-full"
          />
        </div>

        {/* State */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="state"
              className="mb-1.5 block text-sm font-medium text-black-primary"
            >
              State
            </label>
            <input
              id="state"
              name="state"
              type="text"
              maxLength={2}
              value={form.state}
              onChange={handleChange}
              placeholder="CA"
              className="w-full uppercase"
            />
          </div>
          <div>
            <label
              htmlFor="zip"
              className="mb-1.5 block text-sm font-medium text-black-primary"
            >
              ZIP
            </label>
            <input
              id="zip"
              name="zip"
              type="text"
              maxLength={10}
              value={form.zip}
              onChange={handleChange}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Bio — full width */}
      <div className="mt-5">
        <label
          htmlFor="bio"
          className="mb-1.5 block text-sm font-medium text-black-primary"
        >
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          value={form.bio}
          onChange={handleChange}
          placeholder="Tell us about yourself or your business..."
          className="w-full"
        />
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50 cursor-pointer"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </form>
  );
}

/* ================================================================== */
/*  MAIN DASHBOARD COMPONENT                                           */
/* ================================================================== */

export default function DashboardPage() {
  /* ---- Auth State ---- */
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [notLoggedIn, setNotLoggedIn] = useState(false);

  /* ---- Tabs ---- */
  const [operatorTab, setOperatorTab] = useState<OperatorTab>("applications");
  const [managerTab, setManagerTab] = useState<ManagerTab>("requests");

  /* ---- Data ---- */
  const [requests, setRequests] = useState<VendingRequest[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [listings, setListings] = useState<OperatorListing[]>([]);
  const [savedRequests, setSavedRequests] = useState<VendingRequest[]>([]);

  /* ---- Loading flags ---- */
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loadingListings, setLoadingListings] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);

  /* ---- Profile save ---- */
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileToast, setProfileToast] = useState<string | null>(null);

  /* ---- Match action loading ---- */
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  /* ================================================================ */
  /*  Fetch Profile on Mount                                          */
  /* ================================================================ */

  useEffect(() => {
    async function loadProfile() {
      try {
        const token = await getAccessToken();
        if (!token) {
          setNotLoggedIn(true);
          setAuthLoading(false);
          return;
        }

        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
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

    loadProfile();
  }, []);

  /* ================================================================ */
  /*  Data Fetching                                                    */
  /* ================================================================ */

  const fetchRequests = useCallback(async () => {
    if (!profile) return;
    setLoadingRequests(true);
    try {
      const res = await fetch(
        `/api/requests?mine=true&user_id=${profile.id}`
      );
      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      /* noop */
    } finally {
      setLoadingRequests(false);
    }
  }, [profile]);

  const fetchMatches = useCallback(async () => {
    if (!profile) return;
    setLoadingMatches(true);
    try {
      const token = await getAccessToken();
      const roleParam =
        profile.role === "operator" ? "operator" : "location_manager";
      const res = await fetch(`/api/matches?role=${roleParam}`, {
        headers: authHeaders(token),
      });
      const data = await res.json();
      setMatches(Array.isArray(data) ? data : []);
    } catch {
      /* noop */
    } finally {
      setLoadingMatches(false);
    }
  }, [profile]);

  const fetchListings = useCallback(async () => {
    if (!profile) return;
    setLoadingListings(true);
    try {
      const res = await fetch(
        `/api/operators?mine=true&user_id=${profile.id}`
      );
      const data = await res.json();
      setListings(data.listings || []);
    } catch {
      /* noop */
    } finally {
      setLoadingListings(false);
    }
  }, [profile]);

  const fetchSaved = useCallback(async () => {
    if (!profile) return;
    setLoadingSaved(true);
    try {
      const res = await fetch(
        `/api/requests?saved=true&user_id=${profile.id}`
      );
      const data = await res.json();
      setSavedRequests(data.requests || []);
    } catch {
      /* noop */
    } finally {
      setLoadingSaved(false);
    }
  }, [profile]);

  /* Fetch data when profile loads */
  useEffect(() => {
    if (!profile) return;

    if (profile.role === "operator") {
      fetchMatches();
      fetchListings();
      fetchSaved();
    } else {
      fetchRequests();
      fetchMatches();
    }
  }, [profile, fetchMatches, fetchListings, fetchSaved, fetchRequests]);

  /* ================================================================ */
  /*  Actions                                                          */
  /* ================================================================ */

  async function handleMatchAction(matchId: string, status: MatchStatus) {
    if (!profile) return;
    setActionLoading(matchId);
    try {
      const token = await getAccessToken();
      await fetch("/api/matches", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: JSON.stringify({ match_id: matchId, status }),
      });
      await fetchMatches();
    } catch {
      /* noop */
    } finally {
      setActionLoading(null);
    }
  }

  async function handleProfileSave(updates: Partial<Profile>) {
    if (!profile) return;
    setSavingProfile(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        setProfileToast("Profile updated successfully!");
        setTimeout(() => setProfileToast(null), 3000);
      }
    } catch {
      /* noop */
    } finally {
      setSavingProfile(false);
    }
  }

  /* ================================================================ */
  /*  Not Logged In State                                              */
  /* ================================================================ */

  if (authLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 space-y-3">
          <div className="skeleton h-8 w-48" />
          <div className="skeleton h-5 w-64" />
        </div>
        <SkeletonStats />
        <div className="mt-8 space-y-4">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

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
            Please log in or create an account to access your VendHub dashboard,
            manage requests, and connect with operators.
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

  /* ================================================================ */
  /*  Computed Stats                                                   */
  /* ================================================================ */

  const isOperator = profile.role === "operator";
  const firstName = profile.full_name?.split(" ")[0] || "there";

  // Operator stats
  const operatorStats = {
    applications: matches.length,
    accepted: matches.filter((m) => m.status === "accepted").length,
    saved: savedRequests.length,
    messages: 0, // Placeholder — messages fetched separately
  };

  // Manager stats
  const managerStats = {
    requests: requests.length,
    activeMatches: matches.filter(
      (m) => m.status === "pending" || m.status === "accepted"
    ).length,
    messages: 0,
    totalViews: requests.reduce((sum, r) => sum + (r.views || 0), 0),
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      {/* ------- HEADER ------- */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-6 w-6 text-green-primary" />
                <h1 className="text-2xl font-bold text-black-primary sm:text-3xl">
                  Dashboard
                </h1>
              </div>
              <p className="mt-1 text-black-primary/50">
                Welcome back, <span className="font-medium text-black-primary">{firstName}</span>
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2 sm:mt-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-light-warm px-3 py-1.5 text-xs font-medium text-black-primary">
                {isOperator ? (
                  <>
                    <Building2 className="h-3.5 w-3.5 text-green-primary" />
                    Operator
                  </>
                ) : profile.role === "location_manager" ? (
                  <>
                    <MapPin className="h-3.5 w-3.5 text-green-primary" />
                    Location Manager
                  </>
                ) : (
                  <>
                    <User className="h-3.5 w-3.5 text-green-primary" />
                    Requestor
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ------- STATS ------- */}
        {isOperator ? (
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={FileText}
              label="My Applications"
              value={operatorStats.applications}
              color="orange"
            />
            <StatCard
              icon={CheckCircle2}
              label="Accepted"
              value={operatorStats.accepted}
              color="green"
            />
            <StatCard
              icon={Heart}
              label="Saved Requests"
              value={operatorStats.saved}
              color="purple"
            />
            <StatCard
              icon={MessageSquare}
              label="Messages"
              value={operatorStats.messages}
              color="blue"
            />
          </div>
        ) : (
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={FileText}
              label="My Requests"
              value={managerStats.requests}
              color="orange"
            />
            <StatCard
              icon={Handshake}
              label="Active Matches"
              value={managerStats.activeMatches}
              color="green"
            />
            <StatCard
              icon={MessageSquare}
              label="Messages"
              value={managerStats.messages}
              color="blue"
            />
            <StatCard
              icon={Eye}
              label="Total Views"
              value={managerStats.totalViews}
              color="purple"
            />
          </div>
        )}

        {/* ------- TABS ------- */}
        <div className="mb-6 overflow-x-auto border-b border-gray-200 bg-white rounded-t-2xl">
          <div className="flex">
            {isOperator ? (
              <>
                <TabButton
                  label="Applications"
                  icon={FileText}
                  active={operatorTab === "applications"}
                  onClick={() => setOperatorTab("applications")}
                />
                <TabButton
                  label="Browse Requests"
                  icon={Search}
                  active={operatorTab === "browse"}
                  onClick={() => setOperatorTab("browse")}
                />
                <TabButton
                  label="My Listings"
                  icon={List}
                  active={operatorTab === "listings"}
                  onClick={() => setOperatorTab("listings")}
                />
                <TabButton
                  label="Saved"
                  icon={Heart}
                  active={operatorTab === "saved"}
                  onClick={() => setOperatorTab("saved")}
                />
                <TabButton
                  label="Messages"
                  icon={MessageSquare}
                  active={operatorTab === "messages"}
                  onClick={() => setOperatorTab("messages")}
                />
                <TabButton
                  label="Profile"
                  icon={User}
                  active={operatorTab === "profile"}
                  onClick={() => setOperatorTab("profile")}
                />
              </>
            ) : (
              <>
                <TabButton
                  label="My Requests"
                  icon={FileText}
                  active={managerTab === "requests"}
                  onClick={() => setManagerTab("requests")}
                />
                <TabButton
                  label="Matches"
                  icon={Users}
                  active={managerTab === "matches"}
                  onClick={() => setManagerTab("matches")}
                />
                <TabButton
                  label="Messages"
                  icon={MessageSquare}
                  active={managerTab === "messages"}
                  onClick={() => setManagerTab("messages")}
                />
                <TabButton
                  label="Profile"
                  icon={User}
                  active={managerTab === "profile"}
                  onClick={() => setManagerTab("profile")}
                />
              </>
            )}
          </div>
        </div>

        {/* ------- TAB CONTENT ------- */}
        <div className="animate-fade-in">
          {/* =================== OPERATOR TABS =================== */}
          {isOperator && operatorTab === "applications" && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-black-primary">
                  My Applications
                </h2>
                <Link
                  href="/browse-requests"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-green-primary hover:underline"
                >
                  Browse more requests
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              {loadingMatches ? (
                <div className="space-y-3">
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              ) : matches.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No applications yet"
                  description="Start browsing open requests and apply to locations that match your service area."
                  cta="Browse Requests"
                  href="/browse-requests"
                />
              ) : (
                <div className="space-y-3">
                  {matches.map((match) => (
                    <div
                      key={match.id}
                      className="group rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-green-100 hover:shadow-md sm:p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          {match.vending_requests?.location_type && (
                            <LocationTypeIcon
                              type={match.vending_requests.location_type}
                              size="sm"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-black-primary">
                              {match.vending_requests?.title || "Untitled Request"}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-black-primary/50">
                              {match.vending_requests?.city &&
                                match.vending_requests?.state && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {match.vending_requests.city},{" "}
                                    {match.vending_requests.state}
                                  </span>
                                )}
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {relativeDate(match.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <MatchStatusBadge status={match.status} />
                        </div>
                      </div>

                      {/* Pipeline */}
                      <div className="mt-3 border-t border-gray-50 pt-3">
                        <StatusPipeline current={match.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isOperator && operatorTab === "browse" && (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-primary">
                <Search className="h-7 w-7" />
              </div>
              <h3 className="mb-1.5 text-lg font-semibold text-black-primary">
                Browse Open Requests
              </h3>
              <p className="mb-6 max-w-sm text-sm leading-relaxed text-black-primary/50">
                Discover locations looking for vending machines in your service area. Filter by location type, city, and more.
              </p>
              <Link
                href="/browse-requests"
                className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
              >
                Go to Browse Requests
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          )}

          {isOperator && operatorTab === "listings" && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-black-primary">
                  My Listings
                </h2>
                <Link
                  href="/listings/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
                >
                  <Plus className="h-4 w-4" />
                  New Listing
                </Link>
              </div>

              {loadingListings ? (
                <div className="space-y-3">
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              ) : listings.length === 0 ? (
                <EmptyState
                  icon={List}
                  title="No listings yet"
                  description="Create a listing to let location managers know about your vending services and the areas you cover."
                  cta="Create a Listing"
                  href="/listings/new"
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {listings.map((listing) => (
                    <div
                      key={listing.id}
                      className="group rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:border-green-100 hover:shadow-md"
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <h3 className="font-semibold text-black-primary">
                          {listing.title}
                        </h3>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-green-50 hover:text-green-primary cursor-pointer"
                            aria-label="Edit listing"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-black-primary/50">
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5">
                          <Building2 className="h-3 w-3" />
                          {listing.machine_count_available} machines
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5">
                          <MapPin className="h-3 w-3" />
                          {listing.states_served.join(", ")}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5">
                          <Eye className="h-3 w-3" />
                          {listing.views} views
                        </span>
                      </div>

                      {listing.machine_types.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {listing.machine_types.slice(0, 3).map((type) => (
                            <span
                              key={type}
                              className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-primary"
                            >
                              {type.replace(/_/g, " ")}
                            </span>
                          ))}
                          {listing.machine_types.length > 3 && (
                            <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-black-primary/40">
                              +{listing.machine_types.length - 3} more
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-3 border-t border-gray-50 pt-3 text-xs text-black-primary/40">
                        Created {formatDate(listing.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isOperator && operatorTab === "saved" && (
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-black-primary">
                  Saved Requests
                </h2>
              </div>

              {loadingSaved ? (
                <div className="space-y-3">
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              ) : savedRequests.length === 0 ? (
                <EmptyState
                  icon={Heart}
                  title="No saved requests"
                  description="When you find interesting location requests while browsing, save them here for later."
                  cta="Browse Requests"
                  href="/browse-requests"
                />
              ) : (
                <div className="space-y-3">
                  {savedRequests.map((req) => (
                    <Link
                      key={req.id}
                      href={`/requests/${req.id}`}
                      className="group flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-green-100 hover:shadow-md"
                    >
                      <LocationTypeIcon
                        type={req.location_type}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-black-primary group-hover:text-green-primary">
                          {req.title}
                        </p>
                        <p className="mt-0.5 text-xs text-black-primary/50">
                          {req.city}, {req.state}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <RequestStatusBadge status={req.status} />
                        <Heart className="h-4 w-4 fill-red-400 text-red-400" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {isOperator && operatorTab === "messages" && (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <MessageSquare className="h-7 w-7" />
              </div>
              <h3 className="mb-1.5 text-lg font-semibold text-black-primary">
                Messages
              </h3>
              <p className="mb-6 max-w-sm text-sm leading-relaxed text-black-primary/50">
                View and respond to messages from location managers about your applications.
              </p>
              <Link
                href="/messages"
                className="inline-flex items-center gap-2 rounded-xl bg-black-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black-primary-light"
              >
                Go to Messages
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          )}

          {isOperator && operatorTab === "profile" && (
            <ProfileForm
              profile={profile}
              onSave={handleProfileSave}
              saving={savingProfile}
            />
          )}

          {/* =================== MANAGER/REQUESTOR TABS =================== */}
          {!isOperator && managerTab === "requests" && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-black-primary">
                  My Requests
                </h2>
                <Link
                  href="/post-request"
                  className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
                >
                  <Plus className="h-4 w-4" />
                  Post New Request
                </Link>
              </div>

              {loadingRequests ? (
                <div className="space-y-3">
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              ) : requests.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No requests posted yet"
                  description="Post your first request to let vending operators know about your location. It only takes a minute."
                  cta="Post a Request"
                  href="/post-request"
                />
              ) : (
                <div className="space-y-3">
                  {requests.map((req) => (
                    <div
                      key={req.id}
                      className="group rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-green-100 hover:shadow-md sm:p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          <LocationTypeIcon
                            type={req.location_type}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-black-primary">
                              {req.title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-black-primary/50">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {req.city}, {req.state}
                              </span>
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {req.views} views
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {relativeDate(req.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <RequestStatusBadge status={req.status} />
                          <Link
                            href={`/requests/${req.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-black-primary transition-colors hover:border-green-200 hover:bg-green-50 hover:text-green-primary"
                          >
                            View
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isOperator && managerTab === "matches" && (
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-black-primary">
                  Operator Matches
                </h2>
                <p className="mt-1 text-sm text-black-primary/50">
                  Operators who have applied to your requests
                </p>
              </div>

              {loadingMatches ? (
                <div className="space-y-3">
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              ) : matches.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No matches yet"
                  description="Once operators apply to your requests, they will appear here. Make sure your requests are public so operators can find them."
                />
              ) : (
                <div className="space-y-3">
                  {matches.map((match) => {
                    const operator = match.profiles;
                    return (
                      <div
                        key={match.id}
                        className="group rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-green-100 hover:shadow-md sm:p-5"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Avatar */}
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-primary text-sm font-bold text-white">
                              {operator?.full_name
                                ?.split(" ")
                                .map((w: string) => w[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase() || "??"}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-semibold text-black-primary">
                                  {operator?.full_name || "Unknown Operator"}
                                </p>
                                {operator?.verified && (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-500" />
                                )}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-black-primary/50">
                                {operator?.company_name && (
                                  <span>{operator.company_name}</span>
                                )}
                                {match.vending_requests?.title && (
                                  <span className="flex items-center gap-1">
                                    <FileText className="h-3 w-3" />
                                    {match.vending_requests.title}
                                  </span>
                                )}
                              </div>
                              {operator?.rating !== undefined &&
                                operator.rating > 0 && (
                                  <div className="mt-1">
                                    <StarRating
                                      value={operator.rating}
                                      size="sm"
                                    />
                                  </div>
                                )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <MatchStatusBadge status={match.status} />

                            {match.status === "pending" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMatchAction(match.id, "accepted")
                                  }
                                  disabled={actionLoading === match.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                                >
                                  {actionLoading === match.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  )}
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMatchAction(match.id, "declined")
                                  }
                                  disabled={actionLoading === match.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Decline
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!isOperator && managerTab === "messages" && (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <MessageSquare className="h-7 w-7" />
              </div>
              <h3 className="mb-1.5 text-lg font-semibold text-black-primary">
                Messages
              </h3>
              <p className="mb-6 max-w-sm text-sm leading-relaxed text-black-primary/50">
                Communicate with operators who have matched with your requests.
              </p>
              <Link
                href="/messages"
                className="inline-flex items-center gap-2 rounded-xl bg-black-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black-primary-light"
              >
                Go to Messages
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          )}

          {!isOperator && managerTab === "profile" && (
            <ProfileForm
              profile={profile}
              onSave={handleProfileSave}
              saving={savingProfile}
            />
          )}
        </div>
      </div>

      {/* ------- TOAST ------- */}
      {profileToast && (
        <div className="toast toast-success">{profileToast}</div>
      )}
    </div>
  );
}
