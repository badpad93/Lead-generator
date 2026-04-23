"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Building2,
  MapPin,
  Route,
  Users,
  Plus,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Pencil,
  Trash2,
  Search,
  X,
  BadgeCheck,
  Eye,
  ScrollText,
  Briefcase,
  TrendingUp,
  Package,
} from "lucide-react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import {
  MACHINE_TYPES,
  LOCATION_TYPES,
  URGENCY_OPTIONS,
  US_STATES,
} from "@/lib/types";
import type { Profile, VendingRequest, OperatorListing } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Tab =
  | "users"
  | "operators"
  | "locations"
  | "routes"
  | "agreements"
  | "sales_results"
  | "machine_listings";

const inputClass =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary";

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function toggle(arr: string[], val: string) {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

function Toast({
  message,
  type,
}: {
  message: string;
  type: "success" | "error";
}) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
        type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      {type === "success" ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <AlertTriangle className="h-4 w-4" />
      )}
      {message}
    </div>
  );
}

function ChipSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-black-primary">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(toggle(selected, opt.value))}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              selected.includes(opt.value)
                ? "bg-green-primary text-white"
                : "bg-gray-100 text-black-primary/60 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm text-black-primary mt-0.5">{value || "—"}</p>
    </div>
  );
}

function StateSelect({
  label,
  selected,
  onChange,
}: {
  label: string;
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-black-primary">
        {label}
      </label>
      <div className="flex flex-wrap gap-1">
        {US_STATES.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => onChange(toggle(selected, st))}
            className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
              selected.includes(st)
                ? "bg-green-primary text-white"
                : "bg-gray-100 text-black-primary/60 hover:bg-gray-200"
            }`}
          >
            {st}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-black-primary">{title}</h3>
        <p className="mt-2 text-sm text-black-primary/60">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
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
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 cursor-pointer"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Users Management                                                   */
/* ------------------------------------------------------------------ */

function UsersManager({ token }: { token: string }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ role: "", verified: false, full_name: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      params.set("limit", "100");
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [token, search, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function openEdit(user: Profile) {
    setEditingUser(user);
    setEditForm({
      role: user.role,
      verified: user.verified,
      full_name: user.full_name,
      email: user.email,
    });
  }

  async function handleSaveUser() {
    if (!editingUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingUser(null);
        fetchUsers();
      }
    } catch {
      /* noop */
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteTarget(null);
      fetchUsers();
    } catch {
      /* noop */
    } finally {
      setDeleting(false);
    }
  }

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      operator: "bg-blue-50 text-blue-700 ring-blue-200",
      location_manager: "bg-purple-50 text-purple-700 ring-purple-200",
      requestor: "bg-gray-100 text-gray-700 ring-gray-200",
      admin: "bg-red-50 text-red-700 ring-red-200",
      sales: "bg-amber-50 text-amber-700 ring-amber-200",
    };
    const labels: Record<string, string> = {
      operator: "Operator",
      location_manager: "Location Mgr",
      requestor: "Requestor",
      admin: "Admin",
      sales: "Sales",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
          colors[role] || colors.requestor
        }`}
      >
        {labels[role] || role}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black-primary/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
        >
          <option value="">All Roles</option>
          <option value="admin">Admins</option>
          <option value="sales">Sales Team</option>
          <option value="operator">Operators</option>
          <option value="location_manager">Location Managers</option>
          <option value="requestor">Requestors</option>
        </select>
      </div>

      <p className="text-xs text-black-primary/40">{total} user{total !== 1 ? "s" : ""} total</p>

      {/* Users Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
        </div>
      ) : users.length === 0 ? (
        <p className="py-8 text-center text-sm text-black-primary/40">No users found</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-black-primary/60">Name</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Email</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Role</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Verified</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Joined</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-black-primary">
                    {user.full_name}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60">{user.email}</td>
                  <td className="px-4 py-3">{roleBadge(user.role)}</td>
                  <td className="px-4 py-3">
                    {user.verified ? (
                      <BadgeCheck className="h-5 w-5 text-green-500" />
                    ) : (
                      <span className="text-xs text-black-primary/30">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-primary/40 text-xs">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(user)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black-primary">Edit User</h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-lg p-1 text-black-primary/40 hover:bg-gray-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Name</label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                >
                  <option value="operator">Operator</option>
                  <option value="location_manager">Location Manager</option>
                  <option value="requestor">Requestor</option>
                  <option value="sales">Sales Team Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit_verified"
                  checked={editForm.verified}
                  onChange={(e) => setEditForm((f) => ({ ...f, verified: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="edit_verified" className="text-sm text-black-primary">
                  Verified
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveUser}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-4 py-2 text-sm font-medium text-white hover:bg-green-hover disabled:opacity-50 cursor-pointer"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete User"
          message={`Are you sure you want to delete "${deleteTarget.full_name}" (${deleteTarget.email})? This will remove their account and all associated data.`}
          onConfirm={handleDeleteUser}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Listings Management                                                */
/* ------------------------------------------------------------------ */

type ListingWithProfile = Omit<OperatorListing, "profiles"> & {
  profiles?: { id: string; full_name: string; email: string };
};

function ListingsManager({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (msg: string) => void;
}) {
  const [view, setView] = useState<"list" | "add">("list");
  const [listings, setListings] = useState<ListingWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingListing, setEditingListing] = useState<ListingWithProfile | null>(null);
  const [editForm, setEditForm] = useState({ title: "", status: "", featured: false });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ListingWithProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleApproveListing(listing: ListingWithProfile) {
    try {
      const res = await fetch(`/api/admin/listings/${listing.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ featured: true }),
      });
      if (res.ok) {
        fetchListings();
        onSuccess("Operator listing approved and now visible!");
      }
    } catch {
      /* noop */
    }
  }

  async function handleDenyListing(listing: ListingWithProfile) {
    try {
      const res = await fetch(`/api/admin/listings/${listing.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ featured: false }),
      });
      if (res.ok) {
        fetchListings();
        onSuccess("Operator listing unapproved.");
      }
    } catch {
      /* noop */
    }
  }

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/operators", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setListings(data.listings || []);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  function openEdit(listing: ListingWithProfile) {
    setEditingListing(listing);
    setEditForm({
      title: listing.title,
      status: listing.status,
      featured: listing.featured,
    });
  }

  async function handleSave() {
    if (!editingListing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/listings/${editingListing.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingListing(null);
        fetchListings();
        onSuccess("Listing updated!");
      }
    } catch {
      /* noop */
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/listings/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteTarget(null);
      fetchListings();
      onSuccess("Listing deleted!");
    } catch {
      /* noop */
    } finally {
      setDeleting(false);
    }
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      available: "bg-green-50 text-green-700 ring-green-200",
      limited: "bg-amber-50 text-amber-700 ring-amber-200",
      full: "bg-red-50 text-red-700 ring-red-200",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
          colors[status] || "bg-gray-100 text-gray-700 ring-gray-200"
        }`}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toggle between list and add */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black-primary">
          {view === "list" ? "All Operator Listings" : "Add Operator Listing"}
        </h2>
        <button
          type="button"
          onClick={() => setView(view === "list" ? "add" : "list")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary transition-colors hover:bg-gray-50 cursor-pointer"
        >
          {view === "list" ? (
            <>
              <Plus className="h-4 w-4" />
              Add New
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              View All
            </>
          )}
        </button>
      </div>

      {view === "add" ? (
        <OperatorForm
          token={token}
          onSuccess={(msg) => {
            onSuccess(msg);
            setView("list");
            fetchListings();
          }}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
        </div>
      ) : listings.length === 0 ? (
        <p className="py-8 text-center text-sm text-black-primary/40">No listings yet</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-black-primary/60">Title</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Operator</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Machines</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Status</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Approved</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {listings.map((listing) => (
                <tr key={listing.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-black-primary max-w-[200px] truncate">
                    {listing.title}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {listing.profiles?.full_name || "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60">
                    {listing.machine_count_available}
                  </td>
                  <td className="px-4 py-3">{statusBadge(listing.status)}</td>
                  <td className="px-4 py-3">
                    {listing.featured ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
                        Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {!listing.featured && (
                        <button
                          type="button"
                          onClick={() => handleApproveListing(listing)}
                          className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-green-50 hover:text-green-600 cursor-pointer"
                          title="Approve"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(listing)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(listing)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black-primary">Edit Listing</h3>
              <button
                type="button"
                onClick={() => setEditingListing(null)}
                className="rounded-lg p-1 text-black-primary/40 hover:bg-gray-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                >
                  <option value="available">Available</option>
                  <option value="limited">Limited</option>
                  <option value="full">Full</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit_featured"
                  checked={editForm.featured}
                  onChange={(e) => setEditForm((f) => ({ ...f, featured: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="edit_featured" className="text-sm text-black-primary">
                  Featured listing
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingListing(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-4 py-2 text-sm font-medium text-white hover:bg-green-hover disabled:opacity-50 cursor-pointer"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Listing"
          message={`Are you sure you want to delete "${deleteTarget.title}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Requests Management                                                */
/* ------------------------------------------------------------------ */

type RequestWithProfile = Omit<VendingRequest, "profiles"> & {
  profiles?: { id: string; full_name: string; email: string };
};

function RequestsManager({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (msg: string) => void;
}) {
  const [view, setView] = useState<"list" | "add">("list");
  const [requests, setRequests] = useState<RequestWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [adminPage, setAdminPage] = useState(0);
  const [adminSearch, setAdminSearch] = useState("");
  const [debouncedAdminSearch, setDebouncedAdminSearch] = useState("");
  const [viewingRequest, setViewingRequest] = useState<RequestWithProfile | null>(null);
  const [editingRequest, setEditingRequest] = useState<RequestWithProfile | null>(null);
  const [editForm, setEditForm] = useState({
    title: "", status: "", urgency: "", is_public: true,
    price: "", location_name: "", address: "", zip: "",
    contact_phone: "", contact_email: "", decision_maker_name: "",
    seller_name: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RequestWithProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleApproveRequest(request: RequestWithProfile) {
    try {
      const res = await fetch(`/api/admin/requests/${request.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_public: true }),
      });
      if (res.ok) {
        fetchRequests();
        onSuccess("Request approved and now publicly visible!");
      }
    } catch {
      /* noop */
    }
  }

  // Debounce admin search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAdminSearch(adminSearch);
      setAdminPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [adminSearch]);

  const PER_PAGE_ADMIN = 100;

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(adminPage));
      params.set("per_page", String(PER_PAGE_ADMIN));
      if (debouncedAdminSearch) params.set("search", debouncedAdminSearch);
      const res = await fetch(`/api/admin/requests?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRequests(data.requests || []);
      setTotalCount(data.total || 0);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [token, adminPage, debouncedAdminSearch]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  function openEdit(request: RequestWithProfile) {
    setEditingRequest(request);
    setEditForm({
      title: request.title,
      status: request.status,
      urgency: request.urgency,
      is_public: request.is_public,
      price: request.price != null ? String(request.price) : "",
      location_name: request.location_name || "",
      address: request.address || "",
      zip: request.zip || "",
      contact_phone: request.contact_phone || "",
      contact_email: request.contact_email || "",
      decision_maker_name: request.decision_maker_name || "",
      seller_name: request.seller_name || "",
    });
  }

  async function handleSave() {
    if (!editingRequest) return;
    setSaving(true);
    try {
      const payload = {
        ...editForm,
        price: editForm.price ? Number(editForm.price) : null,
      };
      const res = await fetch(`/api/admin/requests/${editingRequest.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setEditingRequest(null);
        fetchRequests();
        onSuccess("Request updated!");
      }
    } catch {
      /* noop */
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/requests/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteTarget(null);
      fetchRequests();
      onSuccess("Request deleted!");
    } catch {
      /* noop */
    } finally {
      setDeleting(false);
    }
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: "bg-green-50 text-green-700 ring-green-200",
      matched: "bg-blue-50 text-blue-700 ring-blue-200",
      closed: "bg-gray-100 text-gray-500 ring-gray-200",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
          colors[status] || "bg-gray-100 text-gray-700 ring-gray-200"
        }`}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black-primary">
          {view === "list" ? "All Vending Requests" : "Add Location Request"}
        </h2>
        <button
          type="button"
          onClick={() => setView(view === "list" ? "add" : "list")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary transition-colors hover:bg-gray-50 cursor-pointer"
        >
          {view === "list" ? (
            <>
              <Plus className="h-4 w-4" />
              Add New
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              View All
            </>
          )}
        </button>
      </div>

      {/* Search bar */}
      {view === "list" && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={adminSearch}
            onChange={(e) => setAdminSearch(e.target.value)}
            placeholder="Search by title, city, state, or business name..."
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm placeholder:text-gray-400 focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
          />
          {adminSearch && (
            <button
              type="button"
              onClick={() => setAdminSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {view === "add" ? (
        <LocationForm
          token={token}
          onSuccess={(msg) => {
            onSuccess(msg);
            setView("list");
            fetchRequests();
          }}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
        </div>
      ) : requests.length === 0 ? (
        <p className="py-8 text-center text-sm text-black-primary/40">No requests yet</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-black-primary/60">Title</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Location</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Posted By</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Status</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Visibility</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Urgency</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Price</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {requests.map((request) => (
                <tr key={request.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setViewingRequest(request)}>
                  <td className="px-4 py-3 font-medium text-black-primary max-w-[200px] truncate">
                    {request.title}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {request.city && request.state &&
                      request.city.toLowerCase() !== "unknown" &&
                      request.state.toLowerCase() !== "unknown"
                        ? `${request.city}, ${request.state}`
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {request.profiles?.full_name || "Unknown"}
                  </td>
                  <td className="px-4 py-3">{statusBadge(request.status)}</td>
                  <td className="px-4 py-3">
                    {request.is_public ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
                        Public
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-black-primary/60">
                      {URGENCY_OPTIONS.find((u) => u.value === request.urgency)?.label || request.urgency}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-black-primary">
                      {request.price != null ? `$${Number(request.price).toLocaleString()}` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {!request.is_public && (
                        <button
                          type="button"
                          onClick={() => handleApproveRequest(request)}
                          className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-green-50 hover:text-green-600 cursor-pointer"
                          title="Approve (make public)"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(request)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(request)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination & count */}
      {!loading && requests.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Showing {adminPage * PER_PAGE_ADMIN + 1}–{Math.min((adminPage + 1) * PER_PAGE_ADMIN, totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAdminPage((p) => Math.max(0, p - 1))}
              disabled={adminPage === 0}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-black-primary disabled:opacity-40 hover:bg-gray-50 cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setAdminPage((p) => p + 1)}
              disabled={(adminPage + 1) * PER_PAGE_ADMIN >= totalCount}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-black-primary disabled:opacity-40 hover:bg-gray-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail View Modal */}
      {viewingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8">
          <div className="mx-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
              <h3 className="text-lg font-semibold text-black-primary">Lead Details</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setViewingRequest(null); openEdit(viewingRequest); }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5 inline mr-1" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setViewingRequest(null)}
                  className="rounded-lg p-1 text-black-primary/40 hover:bg-gray-100 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <h4 className="text-xl font-bold text-black-primary">{viewingRequest.title}</h4>
                <p className="text-xs text-gray-400 mt-1">ID: {viewingRequest.id}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Status" value={viewingRequest.status} />
                <DetailField label="Visibility" value={viewingRequest.is_public ? "Public" : "Pending"} />
                <DetailField label="Price" value={viewingRequest.price != null ? `$${Number(viewingRequest.price).toLocaleString()}` : "Not set"} />
                <DetailField label="Urgency" value={URGENCY_OPTIONS.find((u) => u.value === viewingRequest.urgency)?.label || viewingRequest.urgency} />
              </div>

              <hr className="border-gray-100" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</p>
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Business Name" value={viewingRequest.location_name} />
                <DetailField label="City" value={viewingRequest.city} />
                <DetailField label="State" value={viewingRequest.state} />
                <DetailField label="Zip" value={viewingRequest.zip} />
                <DetailField label="Address" value={viewingRequest.address} />
                <DetailField label="Location Type" value={LOCATION_TYPES.find((lt) => lt.value === viewingRequest.location_type)?.label || viewingRequest.location_type} />
              </div>

              <hr className="border-gray-100" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact Info</p>
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Decision Maker" value={viewingRequest.decision_maker_name} />
                <DetailField label="Phone" value={viewingRequest.contact_phone} />
                <DetailField label="Email" value={viewingRequest.contact_email} />
                <DetailField label="Seller Name" value={viewingRequest.seller_name} />
                <DetailField label="Posted By" value={viewingRequest.profiles?.full_name} />
                <DetailField label="Posted By Email" value={viewingRequest.profiles?.email} />
              </div>

              <hr className="border-gray-100" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</p>
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Machine Types" value={viewingRequest.machine_types_wanted?.map((mt: string) => MACHINE_TYPES.find((m) => m.value === mt)?.label || mt).join(", ")} />
                <DetailField label="Daily Traffic" value={viewingRequest.estimated_daily_traffic != null ? String(viewingRequest.estimated_daily_traffic) : null} />
                <DetailField label="Commission Offered" value={viewingRequest.commission_offered ? "Yes" : "No"} />
                <DetailField label="Created" value={new Date(viewingRequest.created_at).toLocaleDateString()} />
              </div>

              {viewingRequest.description && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
                  <p className="text-sm text-black-primary/80 whitespace-pre-line bg-gray-50 rounded-lg p-3">{viewingRequest.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black-primary">Edit Request</h3>
              <button
                type="button"
                onClick={() => setEditingRequest(null)}
                className="rounded-lg p-1 text-black-primary/40 hover:bg-gray-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Price ($)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.price}
                  onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="e.g. 20"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Business Name</label>
                <input
                  type="text"
                  value={editForm.location_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, location_name: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Address</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Zip Code</label>
                <input
                  type="text"
                  value={editForm.zip}
                  onChange={(e) => setEditForm((f) => ({ ...f, zip: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                >
                  <option value="open">Open</option>
                  <option value="matched">Matched</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Urgency</label>
                <select
                  value={editForm.urgency}
                  onChange={(e) => setEditForm((f) => ({ ...f, urgency: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                >
                  {URGENCY_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Seller Name</label>
                <input
                  type="text"
                  value={editForm.seller_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, seller_name: e.target.value }))}
                  placeholder="e.g. John Smith"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <hr className="border-gray-100" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact Info (shown after purchase)</p>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Decision Maker Name</label>
                <input
                  type="text"
                  value={editForm.decision_maker_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, decision_maker_name: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Contact Phone</label>
                <input
                  type="text"
                  value={editForm.contact_phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, contact_phone: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Contact Email</label>
                <input
                  type="text"
                  value={editForm.contact_email}
                  onChange={(e) => setEditForm((f) => ({ ...f, contact_email: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <hr className="border-gray-100" />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit_public"
                  checked={editForm.is_public}
                  onChange={(e) => setEditForm((f) => ({ ...f, is_public: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="edit_public" className="text-sm text-black-primary">
                  Publicly visible
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingRequest(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-4 py-2 text-sm font-medium text-white hover:bg-green-hover disabled:opacity-50 cursor-pointer"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Request"
          message={`Are you sure you want to delete "${deleteTarget.title}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Operator Listing Form (kept from original)                         */
/* ------------------------------------------------------------------ */

function OperatorForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    machine_types: [] as string[],
    service_radius_miles: 50,
    cities_served: [] as string[],
    states_served: [] as string[],
    accepts_commission: true,
    min_daily_traffic: 0,
    machine_count_available: 1,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/operators", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
        } catch {
          setError(text || `Error ${res.status}`);
        }
        return;
      }

      onSuccess("Operator listing created!");
      setForm({
        title: "",
        description: "",
        machine_types: [],
        service_radius_miles: 50,
        cities_served: [],
        states_served: [],
        accepts_commission: true,
        min_daily_traffic: 0,
        machine_count_available: 1,
      });
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Listing Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Full-service vending operator in Denver metro"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Description</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Describe the operator's services..."
          className={inputClass}
        />
      </div>
      <ChipSelect
        label="Machine Types *"
        options={MACHINE_TYPES}
        selected={form.machine_types}
        onChange={(val) => setForm((f) => ({ ...f, machine_types: val }))}
      />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Machines Available</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={form.machine_count_available}
            onChange={(e) => setForm((f) => ({ ...f, machine_count_available: parseInt(e.target.value) || 1 }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Service Radius (mi)</label>
          <input
            type="number"
            min={1}
            max={500}
            value={form.service_radius_miles}
            onChange={(e) => setForm((f) => ({ ...f, service_radius_miles: parseInt(e.target.value) || 50 }))}
            className={inputClass}
          />
        </div>
      </div>
      <StateSelect
        label="States Served *"
        selected={form.states_served}
        onChange={(val) => setForm((f) => ({ ...f, states_served: val }))}
      />
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="accepts_commission"
          checked={form.accepts_commission}
          onChange={(e) => setForm((f) => ({ ...f, accepts_commission: e.target.checked }))}
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="accepts_commission" className="text-sm text-black-primary">
          Accepts commission-based arrangements
        </label>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50 cursor-pointer"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add Operator Listing
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Location Request Form (kept from original)                         */
/* ------------------------------------------------------------------ */

function LocationForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    location_name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    location_type: "office" as string,
    machine_types_wanted: [] as string[],
    estimated_daily_traffic: 0,
    commission_offered: false,
    commission_notes: "",
    urgency: "flexible" as string,
    contact_preference: "platform_message" as string,
    is_public: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...form,
        estimated_daily_traffic: form.estimated_daily_traffic || undefined,
        commission_notes: form.commission_notes || undefined,
        address: form.address || undefined,
        zip: form.zip || undefined,
        description: form.description || undefined,
      };

      const res = await fetch("/api/admin/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
        } catch {
          setError(text || `Error ${res.status}`);
        }
        return;
      }

      onSuccess("Location request created!");
      setForm({
        title: "",
        description: "",
        location_name: "",
        address: "",
        city: "",
        state: "",
        zip: "",
        location_type: "office",
        machine_types_wanted: [],
        estimated_daily_traffic: 0,
        commission_offered: false,
        commission_notes: "",
        urgency: "flexible",
        contact_preference: "platform_message",
        is_public: true,
      });
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Request Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Snack machine needed for office lobby"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Location Name *</label>
        <input
          type="text"
          value={form.location_name}
          onChange={(e) => setForm((f) => ({ ...f, location_name: e.target.value }))}
          placeholder="e.g. Apex Office Park Building A"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Description</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Describe the location and what you're looking for..."
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Address</label>
        <input
          type="text"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          placeholder="123 Main St"
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">City *</label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">State *</label>
          <select
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            required
            className={inputClass}
          >
            <option value="">Select</option>
            {US_STATES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">ZIP</label>
          <input
            type="text"
            value={form.zip}
            onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
            maxLength={10}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Location Type *</label>
        <select
          value={form.location_type}
          onChange={(e) => setForm((f) => ({ ...f, location_type: e.target.value }))}
          className={inputClass}
        >
          {LOCATION_TYPES.map((lt) => (
            <option key={lt.value} value={lt.value}>{lt.label}</option>
          ))}
        </select>
      </div>
      <ChipSelect
        label="Machine Types Wanted *"
        options={MACHINE_TYPES}
        selected={form.machine_types_wanted}
        onChange={(val) => setForm((f) => ({ ...f, machine_types_wanted: val }))}
      />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Est. Daily Traffic</label>
          <input
            type="number"
            min={0}
            max={100000}
            value={form.estimated_daily_traffic}
            onChange={(e) => setForm((f) => ({ ...f, estimated_daily_traffic: parseInt(e.target.value) || 0 }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Urgency</label>
          <select
            value={form.urgency}
            onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value }))}
            className={inputClass}
          >
            {URGENCY_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="commission_offered"
          checked={form.commission_offered}
          onChange={(e) => setForm((f) => ({ ...f, commission_offered: e.target.checked }))}
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="commission_offered" className="text-sm text-black-primary">
          Commission offered to operator
        </label>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50 cursor-pointer"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add Location Request
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Routes Manager                                                     */
/* ------------------------------------------------------------------ */

interface RouteWithProfile {
  id: string;
  title: string;
  city: string;
  state: string;
  status: string;
  asking_price: number | null;
  monthly_revenue: number | null;
  num_machines: number;
  num_locations: number;
  created_at: string;
  profiles?: { id: string; full_name: string; email: string } | null;
}

function RoutesManager({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (msg: string) => void;
}) {
  const [view, setView] = useState<"list" | "add">("list");
  const [routes, setRoutes] = useState<RouteWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRoute, setEditingRoute] = useState<RouteWithProfile | null>(null);
  const [editForm, setEditForm] = useState({ title: "", status: "", asking_price: "", monthly_revenue: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RouteWithProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/routes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRoutes(data.routes || []);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  function openEdit(route: RouteWithProfile) {
    setEditingRoute(route);
    setEditForm({
      title: route.title,
      status: route.status,
      asking_price: route.asking_price != null ? String(route.asking_price) : "",
      monthly_revenue: route.monthly_revenue != null ? String(route.monthly_revenue) : "",
    });
  }

  async function handleSave() {
    if (!editingRoute) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/routes/${editingRoute.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editForm.title,
          status: editForm.status,
          asking_price: editForm.asking_price ? Number(editForm.asking_price) : null,
          monthly_revenue: editForm.monthly_revenue ? Number(editForm.monthly_revenue) : null,
        }),
      });
      if (res.ok) {
        setEditingRoute(null);
        fetchRoutes();
        onSuccess("Route updated!");
      }
    } catch {
      /* noop */
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(route: RouteWithProfile) {
    try {
      const res = await fetch(`/api/admin/routes/${route.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "active" }),
      });
      if (res.ok) {
        fetchRoutes();
        onSuccess("Route approved and now visible to users!");
      }
    } catch {
      /* noop */
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/routes/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteTarget(null);
      fetchRoutes();
      onSuccess("Route deleted!");
    } catch {
      /* noop */
    } finally {
      setDeleting(false);
    }
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-50 text-green-700 ring-green-200",
      pending: "bg-amber-50 text-amber-700 ring-amber-200",
      sold: "bg-gray-100 text-gray-500 ring-gray-200",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
          colors[status] || "bg-gray-100 text-gray-700 ring-gray-200"
        }`}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black-primary">
          {view === "list" ? "All Route Listings" : "Add Route For Sale"}
        </h2>
        <button
          type="button"
          onClick={() => setView(view === "list" ? "add" : "list")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary transition-colors hover:bg-gray-50 cursor-pointer"
        >
          {view === "list" ? (
            <>
              <Plus className="h-4 w-4" />
              Add New
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              View All
            </>
          )}
        </button>
      </div>

      {view === "add" ? (
        <RouteForm
          token={token}
          onSuccess={(msg) => {
            onSuccess(msg);
            setView("list");
            fetchRoutes();
          }}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
        </div>
      ) : routes.length === 0 ? (
        <p className="py-8 text-center text-sm text-black-primary/40">No route listings yet</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-black-primary/60">Title</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Location</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Submitted By</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Price</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Status</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {routes.map((route) => (
                <tr key={route.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-black-primary max-w-[200px] truncate">
                    {route.title}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {route.city && route.state &&
                      route.city.toLowerCase() !== "unknown" &&
                      route.state.toLowerCase() !== "unknown"
                        ? `${route.city}, ${route.state}`
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {route.profiles?.full_name || "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {route.asking_price ? `$${route.asking_price.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3">{statusBadge(route.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {route.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => handleApprove(route)}
                          className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-green-50 hover:text-green-600 cursor-pointer"
                          title="Approve"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(route)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(route)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black-primary">Edit Route</h3>
              <button
                type="button"
                onClick={() => setEditingRoute(null)}
                className="rounded-lg p-1 text-black-primary/40 hover:bg-gray-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active (Approved)</option>
                  <option value="sold">Sold</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Asking Price ($)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.asking_price}
                  onChange={(e) => setEditForm((f) => ({ ...f, asking_price: e.target.value }))}
                  placeholder="e.g. 50000"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">Monthly Revenue ($)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.monthly_revenue}
                  onChange={(e) => setEditForm((f) => ({ ...f, monthly_revenue: e.target.value }))}
                  placeholder="e.g. 5000"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingRoute(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-4 py-2 text-sm font-medium text-white hover:bg-green-hover disabled:opacity-50 cursor-pointer"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Route"
          message={`Are you sure you want to delete "${deleteTarget.title}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Route For Sale Form (kept from original)                           */
/* ------------------------------------------------------------------ */

function RouteForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    city: "",
    state: "",
    num_machines: 1,
    num_locations: 1,
    monthly_revenue: 0,
    asking_price: 0,
    machine_types: [] as string[],
    location_types: [] as string[],
    includes_equipment: true,
    includes_contracts: true,
    contact_email: "",
    contact_phone: "",
    status: "active" as string,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...form,
        monthly_revenue: form.monthly_revenue || undefined,
        asking_price: form.asking_price || undefined,
        contact_email: form.contact_email || undefined,
        contact_phone: form.contact_phone || undefined,
      };

      const res = await fetch("/api/admin/routes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
        } catch {
          setError(text || `Error ${res.status}`);
        }
        return;
      }

      onSuccess("Route listing created!");
      setForm({
        title: "",
        description: "",
        city: "",
        state: "",
        num_machines: 1,
        num_locations: 1,
        monthly_revenue: 0,
        asking_price: 0,
        machine_types: [],
        location_types: [],
        includes_equipment: true,
        includes_contracts: true,
        contact_email: "",
        contact_phone: "",
        status: "active",
      });
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Route Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. 15-machine Denver metro route — $8k/mo revenue"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Description</label>
        <textarea
          rows={4}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Describe the route, locations, revenue history, reason for selling..."
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">City *</label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">State *</label>
          <select
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            required
            className={inputClass}
          >
            <option value="">Select</option>
            {US_STATES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Number of Machines *</label>
          <input
            type="number"
            min={1}
            value={form.num_machines}
            onChange={(e) => setForm((f) => ({ ...f, num_machines: parseInt(e.target.value) || 1 }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Number of Locations *</label>
          <input
            type="number"
            min={1}
            value={form.num_locations}
            onChange={(e) => setForm((f) => ({ ...f, num_locations: parseInt(e.target.value) || 1 }))}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Monthly Revenue ($)</label>
          <input
            type="number"
            min={0}
            value={form.monthly_revenue}
            onChange={(e) => setForm((f) => ({ ...f, monthly_revenue: parseFloat(e.target.value) || 0 }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Asking Price ($)</label>
          <input
            type="number"
            min={0}
            value={form.asking_price}
            onChange={(e) => setForm((f) => ({ ...f, asking_price: parseFloat(e.target.value) || 0 }))}
            className={inputClass}
          />
        </div>
      </div>
      <ChipSelect
        label="Machine Types *"
        options={MACHINE_TYPES}
        selected={form.machine_types}
        onChange={(val) => setForm((f) => ({ ...f, machine_types: val }))}
      />
      <ChipSelect
        label="Location Types"
        options={LOCATION_TYPES}
        selected={form.location_types}
        onChange={(val) => setForm((f) => ({ ...f, location_types: val }))}
      />
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="includes_equipment"
            checked={form.includes_equipment}
            onChange={(e) => setForm((f) => ({ ...f, includes_equipment: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="includes_equipment" className="text-sm text-black-primary">
            Includes equipment
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="includes_contracts"
            checked={form.includes_contracts}
            onChange={(e) => setForm((f) => ({ ...f, includes_contracts: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="includes_contracts" className="text-sm text-black-primary">
            Includes location contracts
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Contact Email</label>
          <input
            type="email"
            value={form.contact_email}
            onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
            placeholder="seller@example.com"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Contact Phone</label>
          <input
            type="tel"
            value={form.contact_phone}
            onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
            placeholder="(555) 123-4567"
            className={inputClass}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50 cursor-pointer"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add Route Listing
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Agreements Manager                                                 */
/* ------------------------------------------------------------------ */

interface AdminAgreement {
  id: string;
  user_id: string;
  user_email: string;
  lead_id: string | null;
  purchase_id: string | null;
  agreement_version: string;
  agreement_text: string;
  accepted_terms: boolean;
  accepted_population_clause: boolean;
  accepted_esign: boolean;
  full_name: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

function AgreementsManager({ token }: { token: string }) {
  const [agreements, setAgreements] = useState<AdminAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingAgreement, setViewingAgreement] = useState<AdminAgreement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchAgreements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agreements", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAgreements(data.agreements || []);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAgreements();
  }, [fetchAgreements]);

  const filtered = agreements.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.user_email.toLowerCase().includes(q) ||
      a.full_name.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      (a.lead_id && a.lead_id.toLowerCase().includes(q)) ||
      (a.purchase_id && a.purchase_id.toLowerCase().includes(q))
    );
  });

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-black-primary">Signed Agreements</h2>
          <p className="text-sm text-black-primary/50 mt-1">
            {agreements.length} total agreement{agreements.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black-primary/30" />
        <input
          type="text"
          placeholder="Search by email, name, ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-black-primary/40">
          {searchQuery ? "No agreements match your search." : "No signed agreements yet."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-black-primary/60">User Email</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Full Name</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Lead ID</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Purchase ID</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Date Signed</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">IP Address</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Version</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((agreement) => (
                <tr key={agreement.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-black-primary text-xs max-w-[180px] truncate">
                    {agreement.user_email}
                  </td>
                  <td className="px-4 py-3 font-medium text-black-primary text-xs">
                    {agreement.full_name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-black-primary/60">
                    {agreement.lead_id ? agreement.lead_id.slice(0, 8) : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-black-primary/60">
                    {agreement.purchase_id ? agreement.purchase_id.slice(0, 8) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-black-primary/60">
                    {formatDate(agreement.created_at)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-black-primary/60">
                    {agreement.ip_address || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
                      {agreement.agreement_version}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setViewingAgreement(agreement)}
                      className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                      title="View Details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {viewingAgreement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8">
          <div className="mx-4 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h3 className="text-lg font-semibold text-black-primary">Agreement Details</h3>
              <button
                type="button"
                onClick={() => setViewingAgreement(null)}
                className="rounded-lg p-1 text-black-primary/40 hover:bg-gray-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4">
              {/* Signer Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-400 uppercase">Full Name</p>
                  <p className="text-sm font-semibold text-black-primary mt-1">{viewingAgreement.full_name}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-400 uppercase">Email</p>
                  <p className="text-sm text-black-primary mt-1">{viewingAgreement.user_email}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-400 uppercase">Date Signed</p>
                  <p className="text-sm text-black-primary mt-1">{formatDate(viewingAgreement.created_at)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-400 uppercase">IP Address</p>
                  <p className="text-sm font-mono text-black-primary mt-1">{viewingAgreement.ip_address || "N/A"}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-400 uppercase">Agreement ID</p>
                  <p className="text-sm font-mono text-black-primary mt-1">{viewingAgreement.id}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-400 uppercase">Version</p>
                  <p className="text-sm text-black-primary mt-1">{viewingAgreement.agreement_version}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-400 uppercase">Lead ID</p>
                  <p className="text-sm font-mono text-black-primary mt-1">{viewingAgreement.lead_id || "N/A"}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-400 uppercase">Purchase ID</p>
                  <p className="text-sm font-mono text-black-primary mt-1">{viewingAgreement.purchase_id || "N/A"}</p>
                </div>
              </div>

              {/* Checkbox Values */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase mb-2">Acknowledgments</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`h-4 w-4 ${viewingAgreement.accepted_population_clause ? "text-green-500" : "text-red-400"}`} />
                    <span className="text-sm text-black-primary">Population delay clause</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`h-4 w-4 ${viewingAgreement.accepted_terms ? "text-green-500" : "text-red-400"}`} />
                    <span className="text-sm text-black-primary">Lead Purchase Agreement terms</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`h-4 w-4 ${viewingAgreement.accepted_esign ? "text-green-500" : "text-red-400"}`} />
                    <span className="text-sm text-black-primary">Electronic signature consent</span>
                  </div>
                </div>
              </div>

              {/* User Agent */}
              {viewingAgreement.user_agent && (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase mb-1">User Agent</p>
                  <p className="text-xs text-black-primary/60 break-all bg-gray-50 rounded-lg p-2">{viewingAgreement.user_agent}</p>
                </div>
              )}

              {/* Full Agreement Text */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase mb-2">Full Agreement Text</p>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 max-h-60 overflow-y-auto">
                  <pre className="text-xs text-black-primary/70 whitespace-pre-wrap font-sans">{viewingAgreement.agreement_text}</pre>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setViewingAgreement(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary hover:bg-gray-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sales Results Manager                                              */
/* ------------------------------------------------------------------ */

interface SalesResults {
  metrics: {
    leads_total: number;
    leads_by_status: Record<string, number>;
    deals_total: number;
    deals_won: number;
    pipeline_value: number;
    won_value: number;
    orders_total: number;
    orders_completed: number;
    order_revenue: number;
    conversion_rate: number;
  };
  goal: {
    id: string;
    period: string;
    target_revenue: number;
    target_deals: number;
    target_leads: number;
  } | null;
}

function SalesResultsManager({ token }: { token: string }) {
  const [salesUsers, setSalesUsers] = useState<{ id: string; full_name: string; email: string; role: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [results, setResults] = useState<SalesResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [goalForm, setGoalForm] = useState({ target_revenue: "", target_deals: "", target_leads: "" });
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch("/api/sales/users", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const reps = (data || []).filter((u: { role: string }) => u.role === "sales");
        setSalesUsers(reps);
        if (reps.length && !selectedUser) setSelectedUser(reps[0].id);
      });
  }, [token, selectedUser]);

  const loadResults = useCallback(async () => {
    if (!token || !selectedUser) return;
    setLoading(true);
    const res = await fetch(`/api/sales/results?user_id=${selectedUser}&period=${period}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setResults(data);
      if (data.goal) {
        setGoalForm({
          target_revenue: String(data.goal.target_revenue),
          target_deals: String(data.goal.target_deals),
          target_leads: String(data.goal.target_leads),
        });
      } else {
        setGoalForm({ target_revenue: "", target_deals: "", target_leads: "" });
      }
    }
    setLoading(false);
  }, [token, selectedUser, period]);

  useEffect(() => { loadResults(); }, [loadResults]);

  async function saveGoal() {
    if (!selectedUser) return;
    setSavingGoal(true);
    const goalPeriod = period === "ytd" ? "yearly" : period;
    await fetch("/api/sales/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        user_id: selectedUser,
        period: goalPeriod,
        target_revenue: Number(goalForm.target_revenue) || 0,
        target_deals: Number(goalForm.target_deals) || 0,
        target_leads: Number(goalForm.target_leads) || 0,
      }),
    });
    setSavingGoal(false);
    loadResults();
  }

  const fmt = (n: number) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={selectedUser}
          onChange={(e) => setSelectedUser(e.target.value)}
          className={inputClass}
        >
          <option value="">Select sales rep...</option>
          {salesUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className={inputClass}
        >
          <option value="daily">Today</option>
          <option value="weekly">This Week</option>
          <option value="monthly">This Month</option>
          <option value="quarterly">This Quarter</option>
          <option value="ytd">YTD</option>
          <option value="yearly">Year</option>
        </select>
      </div>

      {salesUsers.length === 0 && (
        <p className="text-sm text-black-primary/40">
          No sales reps yet. Use the Users tab to assign a user the &quot;Sales Team Member&quot; role.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>
      ) : results && selectedUser ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-black-primary/50">Leads Worked</p>
              <p className="text-xl font-bold text-black-primary">{results.metrics.leads_total}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-black-primary/50">Deals Won</p>
              <p className="text-xl font-bold text-black-primary">{results.metrics.deals_won}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-black-primary/50">Won Revenue</p>
              <p className="text-xl font-bold text-green-600">{fmt(results.metrics.won_value)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-black-primary/50">Pipeline</p>
              <p className="text-xl font-bold text-black-primary">{fmt(results.metrics.pipeline_value)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-black-primary/50">Orders Sent</p>
              <p className="text-xl font-bold text-black-primary">{results.metrics.orders_total}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-black-primary/50">Order Revenue</p>
              <p className="text-xl font-bold text-black-primary">{fmt(results.metrics.order_revenue)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-black-primary/50">Conversion</p>
              <p className="text-xl font-bold text-black-primary">{(results.metrics.conversion_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-black-primary/50">Completed Orders</p>
              <p className="text-xl font-bold text-black-primary">{results.metrics.orders_completed}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(results.metrics.leads_by_status).map(([k, v]) => (
              <span key={k} className="rounded-full bg-gray-100 px-3 py-1 text-black-primary/70">
                <span className="capitalize">{k}</span>: <strong>{v}</strong>
              </span>
            ))}
          </div>

          {/* Goals */}
          <div className="mt-6 rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-black-primary mb-3">
              Set Goal — {period === "ytd" ? "Yearly" : period.charAt(0).toUpperCase() + period.slice(1)}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-black-primary/60">Revenue Target ($)</label>
                <input
                  type="number"
                  value={goalForm.target_revenue}
                  onChange={(e) => setGoalForm((f) => ({ ...f, target_revenue: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs text-black-primary/60">Deals Target</label>
                <input
                  type="number"
                  value={goalForm.target_deals}
                  onChange={(e) => setGoalForm((f) => ({ ...f, target_deals: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs text-black-primary/60">Leads Target</label>
                <input
                  type="number"
                  value={goalForm.target_leads}
                  onChange={(e) => setGoalForm((f) => ({ ...f, target_leads: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <button
              onClick={saveGoal}
              disabled={savingGoal}
              className="mt-3 rounded-lg bg-green-primary px-4 py-2 text-sm font-medium text-white hover:bg-green-primary/90 disabled:opacity-50 cursor-pointer"
            >
              {savingGoal ? "Saving..." : "Save Goal"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Machine Listings Manager (User-submitted used machines)            */
/* ------------------------------------------------------------------ */

interface MachineListingRow {
  id: string;
  title: string;
  description: string | null;
  city: string;
  state: string;
  machine_make: string | null;
  machine_model: string | null;
  machine_year: number | null;
  machine_type: string | null;
  condition: string | null;
  quantity: number;
  asking_price: number | null;
  includes_card_reader: boolean;
  includes_install: boolean;
  includes_delivery: boolean;
  photos: string[];
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  profiles?: { id: string; full_name: string; email: string } | null;
}

function MachineListingsManager({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (msg: string) => void;
}) {
  const [listings, setListings] = useState<MachineListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MachineListingRow | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    status: "",
    asking_price: "",
    admin_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MachineListingRow | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/machine-listings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setListings(data.listings || []);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  function openEdit(listing: MachineListingRow) {
    setEditing(listing);
    setEditForm({
      title: listing.title,
      status: listing.status,
      asking_price:
        listing.asking_price != null ? String(listing.asking_price) : "",
      admin_notes: listing.admin_notes || "",
    });
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/machine-listings/${editing.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editForm.title,
          status: editForm.status,
          asking_price: editForm.asking_price
            ? Number(editForm.asking_price)
            : null,
          admin_notes: editForm.admin_notes || null,
        }),
      });
      if (res.ok) {
        setEditing(null);
        fetchListings();
        onSuccess("Listing updated!");
      }
    } catch {
      /* noop */
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(listing: MachineListingRow) {
    try {
      const res = await fetch(`/api/admin/machine-listings/${listing.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "active" }),
      });
      if (res.ok) {
        fetchListings();
        onSuccess("Listing approved and now visible to buyers!");
      }
    } catch {
      /* noop */
    }
  }

  async function handleReject(listing: MachineListingRow) {
    try {
      const res = await fetch(`/api/admin/machine-listings/${listing.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "rejected" }),
      });
      if (res.ok) {
        fetchListings();
        onSuccess("Listing rejected.");
      }
    } catch {
      /* noop */
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/machine-listings/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteTarget(null);
      fetchListings();
      onSuccess("Listing deleted!");
    } catch {
      /* noop */
    } finally {
      setDeleting(false);
    }
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-50 text-green-700 ring-green-200",
      pending: "bg-amber-50 text-amber-700 ring-amber-200",
      sold: "bg-gray-100 text-gray-500 ring-gray-200",
      rejected: "bg-red-50 text-red-700 ring-red-200",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
          colors[status] || "bg-gray-100 text-gray-700 ring-gray-200"
        }`}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black-primary">
          User-Submitted Machines
        </h2>
        <p className="text-xs text-black-primary/50">
          Moderate operator-listed machines on /machines-for-sale
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
        </div>
      ) : listings.length === 0 ? (
        <p className="py-8 text-center text-sm text-black-primary/40">
          No machine listings yet
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-black-primary/60">
                  Title
                </th>
                <th className="px-4 py-3 font-medium text-black-primary/60">
                  Location
                </th>
                <th className="px-4 py-3 font-medium text-black-primary/60">
                  Submitted By
                </th>
                <th className="px-4 py-3 font-medium text-black-primary/60">
                  Price
                </th>
                <th className="px-4 py-3 font-medium text-black-primary/60">
                  Status
                </th>
                <th className="px-4 py-3 font-medium text-black-primary/60">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {listings.map((listing) => (
                <tr key={listing.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-black-primary max-w-[200px] truncate">
                    {listing.title}
                    {listing.machine_make || listing.machine_model ? (
                      <div className="text-xs font-normal text-black-primary/50 truncate">
                        {[listing.machine_make, listing.machine_model]
                          .filter(Boolean)
                          .join(" ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {listing.city && listing.state
                      ? `${listing.city}, ${listing.state}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {listing.profiles?.full_name || "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {listing.asking_price
                      ? `$${listing.asking_price.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{statusBadge(listing.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {listing.status === "pending" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApprove(listing)}
                            className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-green-50 hover:text-green-600 cursor-pointer"
                            title="Approve"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(listing)}
                            className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                            title="Reject"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(listing)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(listing)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black-primary">
                Edit Machine Listing
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-1 text-black-primary/40 hover:bg-gray-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">
                  Title
                </label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">
                  Status
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, status: e.target.value }))
                  }
                  className={inputClass}
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active (Approved)</option>
                  <option value="sold">Sold</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">
                  Asking Price ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.asking_price}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      asking_price: e.target.value,
                    }))
                  }
                  placeholder="e.g. 2500"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black-primary">
                  Admin Notes
                </label>
                <textarea
                  rows={3}
                  value={editForm.admin_notes}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      admin_notes: e.target.value,
                    }))
                  }
                  placeholder="Internal notes (not visible to users)"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-black-primary hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-4 py-2 text-sm font-medium text-white hover:bg-green-hover disabled:opacity-50 cursor-pointer"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Listing"
          message={`Are you sure you want to delete "${deleteTarget.title}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Admin Page                                                    */
/* ------------------------------------------------------------------ */

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();

    async function checkAdmin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login?redirect=/admin");
        return;
      }

      setToken(session.access_token);

      const res = await fetch("/api/admin/check", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();

      if (!data.isAdmin) {
        router.replace("/dashboard");
        return;
      }

      setIsAdmin(true);
      setLoading(false);
    }

    checkAdmin();
  }, [router]);

  function handleSuccess(msg: string) {
    setToast({ message: msg, type: "success" });
    setTimeout(() => setToast(null), 3000);
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-160px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-primary" />
      </div>
    );
  }

  if (!isAdmin || !token) return null;

  const tabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: "users", label: "Users", icon: Users },
    { key: "operators", label: "Operator Listings", icon: Building2 },
    { key: "locations", label: "Location Requests", icon: MapPin },
    { key: "routes", label: "Routes For Sale", icon: Route },
    { key: "agreements", label: "Signed Agreements", icon: ScrollText },
    { key: "sales_results", label: "Sales Results", icon: TrendingUp },
    { key: "machine_listings", label: "Machines For Sale", icon: Package },
  ];

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50">
                <Shield className="h-6 w-6 text-green-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-black-primary">
                  Admin Panel
                </h1>
                <p className="text-sm text-black-primary/50">
                  Manage users, listings, requests, and routes
                </p>
              </div>
            </div>
            <Link
              href="/sales"
              className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-primary/90"
            >
              <Briefcase className="h-4 w-4" />
              <span className="hidden sm:inline">Open Sales CRM</span>
              <span className="sm:hidden">CRM</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Tabs */}
        <div className="mb-8 flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === tab.key
                    ? "bg-green-primary text-white shadow-sm"
                    : "text-black-primary/60 hover:bg-gray-50 hover:text-black-primary"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
          {activeTab === "users" && <UsersManager token={token} />}
          {activeTab === "operators" && (
            <ListingsManager token={token} onSuccess={handleSuccess} />
          )}
          {activeTab === "locations" && (
            <RequestsManager token={token} onSuccess={handleSuccess} />
          )}
          {activeTab === "routes" && (
            <RoutesManager token={token} onSuccess={handleSuccess} />
          )}
          {activeTab === "agreements" && (
            <AgreementsManager token={token} />
          )}
          {activeTab === "sales_results" && (
            <SalesResultsManager token={token} />
          )}
          {activeTab === "machine_listings" && (
            <MachineListingsManager token={token} onSuccess={handleSuccess} />
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
