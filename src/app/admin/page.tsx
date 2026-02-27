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
} from "lucide-react";
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

type Tab = "users" | "operators" | "locations" | "routes";

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
    };
    const labels: Record<string, string> = {
      operator: "Operator",
      location_manager: "Location Mgr",
      requestor: "Requestor",
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
                <th className="px-4 py-3 font-medium text-black-primary/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {listings.map((listing) => (
                <tr key={listing.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-black-primary max-w-[200px] truncate">
                    {listing.title}
                    {listing.featured && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                        Featured
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {listing.profiles?.full_name || "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60">
                    {listing.machine_count_available}
                  </td>
                  <td className="px-4 py-3">{statusBadge(listing.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(listing)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(listing)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
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
  const [editingRequest, setEditingRequest] = useState<RequestWithProfile | null>(null);
  const [editForm, setEditForm] = useState({ title: "", status: "", urgency: "", is_public: true });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RequestWithProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [token]);

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
    });
  }

  async function handleSave() {
    if (!editingRequest) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/requests/${editingRequest.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
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
                <th className="px-4 py-3 font-medium text-black-primary/60">Urgency</th>
                <th className="px-4 py-3 font-medium text-black-primary/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {requests.map((request) => (
                <tr key={request.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-black-primary max-w-[200px] truncate">
                    {request.title}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {request.city}, {request.state}
                  </td>
                  <td className="px-4 py-3 text-black-primary/60 text-xs">
                    {request.profiles?.full_name || "Unknown"}
                  </td>
                  <td className="px-4 py-3">{statusBadge(request.status)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-black-primary/60">
                      {URGENCY_OPTIONS.find((u) => u.value === request.urgency)?.label || request.urgency}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(request)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(request)}
                        className="rounded-lg p-1.5 text-black-primary/40 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
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
      {editingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
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

      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
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
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Description</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Describe the operator's services..."
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

      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
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
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Description</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Describe the location and what you're looking for..."
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Address</label>
        <input
          type="text"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          placeholder="123 Main St"
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
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">State *</label>
          <select
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            required
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
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Location Type *</label>
        <select
          value={form.location_type}
          onChange={(e) => setForm((f) => ({ ...f, location_type: e.target.value }))}
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
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Urgency</label>
          <select
            value={form.urgency}
            onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value }))}
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

      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
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
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black-primary">Description</label>
        <textarea
          rows={4}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Describe the route, locations, revenue history, reason for selling..."
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
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">State *</label>
          <select
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            required
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
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Number of Locations *</label>
          <input
            type="number"
            min={1}
            value={form.num_locations}
            onChange={(e) => setForm((f) => ({ ...f, num_locations: parseInt(e.target.value) || 1 }))}
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
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Asking Price ($)</label>
          <input
            type="number"
            min={0}
            value={form.asking_price}
            onChange={(e) => setForm((f) => ({ ...f, asking_price: parseFloat(e.target.value) || 0 }))}
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
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black-primary">Contact Phone</label>
          <input
            type="tel"
            value={form.contact_phone}
            onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
            placeholder="(555) 123-4567"
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
  ];

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
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
            <>
              <h2 className="mb-6 text-lg font-semibold text-black-primary">
                Add Route For Sale
              </h2>
              <RouteForm token={token} onSuccess={handleSuccess} />
            </>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
