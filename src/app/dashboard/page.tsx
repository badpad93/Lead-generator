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
  LogOut,
  X,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type {
  Profile,
  VendingRequest,
  OperatorListing,
  Match,
  MatchStatus,
  RequestStatus,
  MachineType,
} from "@/lib/types";
import { MACHINE_TYPES, US_STATES } from "@/lib/types";
import { getAccessToken } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabase";
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
/*  Confirm Dialog                                                     */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-black-primary">{title}</h3>
        </div>
        <p className="mb-6 text-sm text-black-primary/60">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary transition-colors hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50 cursor-pointer"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Edit Listing Modal                                                 */
/* ------------------------------------------------------------------ */

function EditListingModal({
  listing,
  open,
  saving,
  onSave,
  onCancel,
}: {
  listing: OperatorListing;
  open: boolean;
  saving: boolean;
  onSave: (id: string, updates: Partial<OperatorListing>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: listing.title,
    description: listing.description || "",
    machine_types: listing.machine_types as string[],
    states_served: listing.states_served,
    machine_count_available: listing.machine_count_available,
    service_radius_miles: listing.service_radius_miles,
    accepts_commission: listing.accepts_commission,
  });

  useEffect(() => {
    setForm({
      title: listing.title,
      description: listing.description || "",
      machine_types: listing.machine_types as string[],
      states_served: listing.states_served,
      machine_count_available: listing.machine_count_available,
      service_radius_miles: listing.service_radius_miles,
      accepts_commission: listing.accepts_commission,
    });
  }, [listing]);

  if (!open) return null;

  function toggle(arr: string[], val: string) {
    return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-black-primary">Edit Listing</h3>
          <button type="button" onClick={onCancel} className="rounded-lg p-1 hover:bg-gray-100 cursor-pointer">
            <X className="h-5 w-5 text-black-primary/40" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(listing.id, {
              ...form,
              machine_types: form.machine_types as MachineType[],
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-black-primary">Title</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-black-primary">Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-black-primary">Machines Available</label>
              <input type="number" min={1} max={1000} value={form.machine_count_available} onChange={(e) => setForm((f) => ({ ...f, machine_count_available: parseInt(e.target.value) || 1 }))} className="w-full" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-black-primary">Service Radius (mi)</label>
              <input type="number" min={1} max={500} value={form.service_radius_miles} onChange={(e) => setForm((f) => ({ ...f, service_radius_miles: parseInt(e.target.value) || 50 }))} className="w-full" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-black-primary">Machine Types</label>
            <div className="flex flex-wrap gap-1.5">
              {MACHINE_TYPES.map((mt) => (
                <button
                  key={mt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, machine_types: toggle(f.machine_types, mt.value) }))}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    form.machine_types.includes(mt.value)
                      ? "bg-green-primary text-white"
                      : "bg-gray-100 text-black-primary/60 hover:bg-gray-200"
                  }`}
                >
                  {mt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-black-primary">States Served</label>
            <div className="flex flex-wrap gap-1">
              {US_STATES.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, states_served: toggle(f.states_served, st) }))}
                  className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                    form.states_served.includes(st)
                      ? "bg-green-primary text-white"
                      : "bg-gray-100 text-black-primary/60 hover:bg-gray-200"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, accepts_commission: !f.accepts_commission }))}
              className="cursor-pointer"
            >
              {form.accepts_commission ? (
                <ToggleRight className="h-6 w-6 text-green-primary" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-gray-300" />
              )}
            </button>
            <span className="text-sm text-black-primary">Accepts commission-based arrangements</span>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary hover:bg-gray-50 cursor-pointer">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-5 py-2 text-sm font-semibold text-white hover:bg-green-hover disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Review Modal                                                       */
/* ------------------------------------------------------------------ */

function ReviewModal({
  open,
  operatorName,
  saving,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  operatorName: string;
  saving: boolean;
  onSubmit: (rating: number, comment: string) => void;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-black-primary">Review {operatorName}</h3>
          <button type="button" onClick={onCancel} className="rounded-lg p-1 hover:bg-gray-100 cursor-pointer">
            <X className="h-5 w-5 text-black-primary/40" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(rating, comment);
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-2 block text-sm font-medium text-black-primary">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRating(v)}
                  className="cursor-pointer"
                >
                  <Star
                    className={`h-7 w-7 transition-colors ${
                      v <= rating ? "fill-amber-400 text-amber-400" : "text-gray-200"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-black-primary">Comment (optional)</label>
            <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was your experience?" className="w-full" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary hover:bg-gray-50 cursor-pointer">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-5 py-2 text-sm font-semibold text-white hover:bg-green-hover disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
              Submit Review
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Conversation Type                                                  */
/* ------------------------------------------------------------------ */

interface Conversation {
  partner: { id: string; full_name: string; avatar_url: string | null; company_name: string | null };
  lastMessage: string;
  lastDate: string;
  unread: number;
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

  /* ---- Conversations / unread ---- */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);

  /* ---- Delete confirm dialog ---- */
  const [confirmDelete, setConfirmDelete] = useState<{ type: "request" | "listing"; id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---- Edit listing ---- */
  const [editListing, setEditListing] = useState<OperatorListing | null>(null);
  const [savingListing, setSavingListing] = useState(false);

  /* ---- Review ---- */
  const [reviewTarget, setReviewTarget] = useState<{ matchId: string; operatorId: string; operatorName: string } | null>(null);
  const [savingReview, setSavingReview] = useState(false);
  const [reviewToast, setReviewToast] = useState<string | null>(null);

  /* ================================================================ */
  /*  Fetch Profile on Mount                                          */
  /* ================================================================ */

  useEffect(() => {
    const supabase = createBrowserClient();

    // Listen for auth state — the SSR browser client reads cookies
    // and fires INITIAL_SESSION or SIGNED_IN once the session is ready.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
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
      }
    );

    return () => {
      subscription.unsubscribe();
    };
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

  const fetchConversations = useCallback(async () => {
    if (!profile) return;
    setLoadingConversations(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/messages", {
        headers: authHeaders(token),
      });
      const data = await res.json();
      const convos: Conversation[] = Array.isArray(data) ? data : [];
      setConversations(convos);
      setTotalUnread(convos.reduce((sum, c) => sum + (c.unread || 0), 0));
    } catch {
      /* noop */
    } finally {
      setLoadingConversations(false);
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
    fetchConversations();
  }, [profile, fetchMatches, fetchListings, fetchSaved, fetchRequests, fetchConversations]);

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
  /*  Sign Out                                                         */
  /* ================================================================ */

  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  /* ================================================================ */
  /*  Delete Request / Listing                                         */
  /* ================================================================ */

  async function handleDelete() {
    if (!confirmDelete || !profile) return;
    setDeleting(true);
    try {
      const token = await getAccessToken();
      if (confirmDelete.type === "request") {
        await fetch(`/api/requests/${confirmDelete.id}`, {
          method: "DELETE",
          headers: { "x-user-id": profile.id },
        });
        await fetchRequests();
      } else {
        await fetch(`/api/listings/${confirmDelete.id}`, {
          method: "DELETE",
          headers: { ...authHeaders(token) },
        });
        await fetchListings();
      }
    } catch {
      /* noop */
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  /* ================================================================ */
  /*  Toggle Request Status (open ↔ closed)                            */
  /* ================================================================ */

  async function handleToggleRequestStatus(req: VendingRequest) {
    if (!profile) return;
    const newStatus = req.status === "open" ? "closed" : "open";
    try {
      await fetch(`/api/requests/${req.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": profile.id,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchRequests();
    } catch {
      /* noop */
    }
  }

  /* ================================================================ */
  /*  Edit Listing                                                     */
  /* ================================================================ */

  async function handleSaveListing(id: string, updates: Partial<OperatorListing>) {
    if (!profile) return;
    setSavingListing(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/listings/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await fetchListings();
        setEditListing(null);
      }
    } catch {
      /* noop */
    } finally {
      setSavingListing(false);
    }
  }

  /* ================================================================ */
  /*  Submit Review                                                    */
  /* ================================================================ */

  async function handleSubmitReview(rating: number, comment: string) {
    if (!profile || !reviewTarget) return;
    setSavingReview(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": profile.id,
        },
        body: JSON.stringify({
          reviewee_id: reviewTarget.operatorId,
          match_id: reviewTarget.matchId,
          rating,
          comment: comment || undefined,
        }),
      });
      if (res.ok) {
        setReviewTarget(null);
        setReviewToast("Review submitted! Thank you.");
        setTimeout(() => setReviewToast(null), 3000);
      }
    } catch {
      /* noop */
    } finally {
      setSavingReview(false);
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
    messages: totalUnread,
  };

  // Manager stats
  const managerStats = {
    requests: requests.length,
    activeMatches: matches.filter(
      (m) => m.status === "pending" || m.status === "accepted"
    ).length,
    messages: totalUnread,
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
              label="Unread Messages"
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
              label="Unread Messages"
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
                            onClick={() => setEditListing(listing)}
                            className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-green-50 hover:text-green-primary cursor-pointer"
                            aria-label="Edit listing"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete({ type: "listing", id: listing.id, title: listing.title })}
                            className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-red-50 hover:text-red-500 cursor-pointer"
                            aria-label="Delete listing"
                          >
                            <Trash2 className="h-4 w-4" />
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
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-black-primary">
                  Messages
                  {totalUnread > 0 && (
                    <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-primary px-1.5 text-xs font-bold text-white">
                      {totalUnread}
                    </span>
                  )}
                </h2>
                <Link
                  href="/messages"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-green-primary hover:underline"
                >
                  Open full inbox
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>

              {loadingConversations ? (
                <div className="space-y-3"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
              ) : conversations.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="No messages yet"
                  description="When you connect with location managers, your conversations will appear here."
                />
              ) : (
                <div className="space-y-2">
                  {conversations.map((convo) => (
                    <Link
                      key={convo.partner.id}
                      href={`/messages?with=${convo.partner.id}`}
                      className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-green-100 hover:shadow-md"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-primary text-sm font-bold text-white">
                        {convo.partner.full_name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "??"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className={`truncate text-sm font-semibold ${convo.unread > 0 ? "text-black-primary" : "text-black-primary/70"}`}>
                            {convo.partner.full_name}
                          </p>
                          <span className="ml-2 shrink-0 text-xs text-black-primary/40">{relativeDate(convo.lastDate)}</span>
                        </div>
                        <p className={`mt-0.5 truncate text-xs ${convo.unread > 0 ? "font-medium text-black-primary/70" : "text-black-primary/40"}`}>
                          {convo.lastMessage}
                        </p>
                      </div>
                      {convo.unread > 0 && (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-primary px-1.5 text-xs font-bold text-white">
                          {convo.unread}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
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

                        <div className="flex items-center gap-2">
                          <RequestStatusBadge status={req.status} />
                          <button
                            type="button"
                            onClick={() => handleToggleRequestStatus(req)}
                            title={req.status === "open" ? "Close request" : "Reopen request"}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                              req.status === "open"
                                ? "bg-slate-50 text-slate-600 hover:bg-slate-100"
                                : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                            }`}
                          >
                            {req.status === "open" ? (
                              <><XCircle className="h-3.5 w-3.5" /> Close</>
                            ) : (
                              <><CheckCircle2 className="h-3.5 w-3.5" /> Reopen</>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete({ type: "request", id: req.id, title: req.title })}
                            className="rounded-lg p-1.5 text-black-primary/30 transition-colors hover:bg-red-50 hover:text-red-500 cursor-pointer"
                            aria-label="Delete request"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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

                            {match.status === "accepted" && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleMatchAction(match.id, "installed")
                                }
                                disabled={actionLoading === match.id}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50 cursor-pointer"
                              >
                                {actionLoading === match.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Wrench className="h-3.5 w-3.5" />
                                )}
                                Mark Installed
                              </button>
                            )}

                            {match.status === "installed" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setReviewTarget({
                                    matchId: match.id,
                                    operatorId: match.operator_id,
                                    operatorName: operator?.full_name || "Operator",
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 cursor-pointer"
                              >
                                <Star className="h-3.5 w-3.5" />
                                Leave Review
                              </button>
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
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-black-primary">
                  Messages
                  {totalUnread > 0 && (
                    <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-primary px-1.5 text-xs font-bold text-white">
                      {totalUnread}
                    </span>
                  )}
                </h2>
                <Link
                  href="/messages"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-green-primary hover:underline"
                >
                  Open full inbox
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>

              {loadingConversations ? (
                <div className="space-y-3"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
              ) : conversations.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="No messages yet"
                  description="Once you connect with operators, your conversations will appear here."
                />
              ) : (
                <div className="space-y-2">
                  {conversations.map((convo) => (
                    <Link
                      key={convo.partner.id}
                      href={`/messages?with=${convo.partner.id}`}
                      className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-green-100 hover:shadow-md"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-primary text-sm font-bold text-white">
                        {convo.partner.full_name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "??"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className={`truncate text-sm font-semibold ${convo.unread > 0 ? "text-black-primary" : "text-black-primary/70"}`}>
                            {convo.partner.full_name}
                          </p>
                          <span className="ml-2 shrink-0 text-xs text-black-primary/40">{relativeDate(convo.lastDate)}</span>
                        </div>
                        <p className={`mt-0.5 truncate text-xs ${convo.unread > 0 ? "font-medium text-black-primary/70" : "text-black-primary/40"}`}>
                          {convo.lastMessage}
                        </p>
                      </div>
                      {convo.unread > 0 && (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-primary px-1.5 text-xs font-bold text-white">
                          {convo.unread}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
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

      {/* ------- TOASTS ------- */}
      {profileToast && (
        <div className="toast toast-success">{profileToast}</div>
      )}
      {reviewToast && (
        <div className="toast toast-success">{reviewToast}</div>
      )}

      {/* ------- MODALS ------- */}
      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete ${confirmDelete?.type === "request" ? "Request" : "Listing"}`}
        message={`Are you sure you want to delete "${confirmDelete?.title}"? This action cannot be undone.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {editListing && (
        <EditListingModal
          listing={editListing}
          open={!!editListing}
          saving={savingListing}
          onSave={handleSaveListing}
          onCancel={() => setEditListing(null)}
        />
      )}

      {reviewTarget && (
        <ReviewModal
          open={!!reviewTarget}
          operatorName={reviewTarget.operatorName}
          saving={savingReview}
          onSubmit={handleSubmitReview}
          onCancel={() => setReviewTarget(null)}
        />
      )}
    </div>
  );
}
