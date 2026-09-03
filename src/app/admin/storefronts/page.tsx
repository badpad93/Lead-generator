"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface TenantRow {
  id: string;
  slug: string;
  display_name: string;
  legal_name: string;
  status: string;
  base_pricing_tier_id: string | null;
  tax_status: string;
  created_at: string;
  owner?: { id: string; full_name: string; email: string } | null;
}

interface OwnerOption {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  coffee_agreement_signed: boolean;
  owns_storefront: boolean;
}

export default function AdminStorefrontsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/admin/storefronts/tenants${qs}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { tenants: TenantRow[] };
      setTenants(body.tenants);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-semibold">Storefronts</h1>
        <CreateStorefrontPanel onCreated={load} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <label>Status:</label>
        <select
          className="border rounded px-2 py-1"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      {error ? <div className="mt-3 text-red-700">{error}</div> : null}
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs text-gray-500 uppercase">
          <tr>
            <th className="py-2">Storefront</th>
            <th className="py-2">Owner</th>
            <th className="py-2">Slug</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={4} className="py-4 text-gray-500">
                Loading…
              </td>
            </tr>
          ) : tenants.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-gray-500">
                No tenants.
              </td>
            </tr>
          ) : (
            tenants.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="py-2">
                  <Link
                    href={`/admin/storefronts/${t.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {t.display_name}
                  </Link>
                  <div className="text-xs text-gray-500">{t.legal_name}</div>
                </td>
                <td className="py-2">
                  {t.owner?.full_name ?? "—"}
                  <div className="text-xs text-gray-500">{t.owner?.email}</div>
                </td>
                <td className="py-2">
                  <code>{t.slug}</code>
                </td>
                <td className="py-2">
                  <span
                    className={
                      t.status === "approved"
                        ? "text-green-700"
                        : t.status === "suspended"
                          ? "text-red-700"
                          : "text-amber-700"
                    }
                  >
                    {t.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Admin "New storefront" flow — pick an existing user (typically an
 * operator) as owner, name the storefront, done. Admin-created
 * storefronts are born approved server-side; the storefront is live
 * at /coffee/o/{slug} as soon as this succeeds.
 */
function CreateStorefrontPanel({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  // Remember the picked user's label so refining the search (which
  // replaces the owners list) doesn't blank the "Selected:" line.
  const [ownerLabel, setOwnerLabel] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setOwnersLoading(true);
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(
          `/api/admin/storefronts/owners?search=${encodeURIComponent(ownerSearch)}`,
          { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } },
        );
        const body = (await res.json().catch(() => ({}))) as { owners?: OwnerOption[] };
        if (!cancelled) setOwners(body.owners ?? []);
      } catch {
        if (!cancelled) setOwners([]);
      } finally {
        if (!cancelled) setOwnersLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, ownerSearch]);

  async function create() {
    if (!ownerId || !displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/storefronts/tenants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          owner_profile_id: ownerId,
          display_name: displayName.trim(),
          legal_name: legalName.trim() || undefined,
          slug: slug.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Create failed");
      setOpen(false);
      setOwnerId("");
      setOwnerLabel("");
      setOwnerSearch("");
      setDisplayName("");
      setLegalName("");
      setSlug("");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-black text-white px-4 py-2 text-sm cursor-pointer"
      >
        + New storefront
      </button>
    );
  }

  return (
    <div className="w-full max-w-xl rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium text-sm">New storefront</div>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          Cancel
        </button>
      </div>
      {err ? <div className="mb-2 text-xs text-red-700">{err}</div> : null}
      <label className="block text-xs text-gray-600 mb-1">Owner (search users)</label>
      <input
        type="search"
        value={ownerSearch}
        onChange={(e) => setOwnerSearch(e.target.value)}
        placeholder="Name or email…"
        className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm mb-2"
      />
      {/* Native listbox — built-in selection, keyboard support, and
          scrolling. The previous custom radio-label rows in a short
          overflow div made selection flaky and browsing the full
          user list impossible; a real <select size> is bulletproof. */}
      {ownersLoading && owners.length === 0 ? (
        <div className="mb-3 rounded border border-gray-200 px-2 py-2 text-xs text-gray-400">
          Loading users…
        </div>
      ) : owners.length === 0 ? (
        <div className="mb-3 rounded border border-gray-200 px-2 py-2 text-xs text-gray-400">
          No matching users.
        </div>
      ) : (
        <select
          size={10}
          value={ownerId}
          onChange={(e) => {
            setOwnerId(e.target.value);
            const sel = owners.find((o) => o.id === e.target.value);
            setOwnerLabel(sel ? (sel.full_name ?? sel.email ?? sel.id) : e.target.value);
          }}
          className="mb-1 w-full rounded border border-gray-200 text-sm [&>option]:px-2 [&>option]:py-1.5"
        >
          {owners.map((o) => (
            <option key={o.id} value={o.id} disabled={o.owns_storefront}>
              {(o.full_name ?? o.email ?? o.id) +
                (o.email && o.full_name ? ` — ${o.email}` : "") +
                (o.owns_storefront
                  ? "  (already owns a storefront)"
                  : o.coffee_agreement_signed
                    ? "  (coffee signed)"
                    : "")}
            </option>
          ))}
        </select>
      )}
      <div className="mb-3 text-xs text-gray-600">
        {ownerId ? (
          <>
            Selected:{" "}
            <span className="font-medium text-gray-900">{ownerLabel || ownerId}</span>
          </>
        ) : (
          "Click a user above to select the owner"
        )}
        {ownersLoading ? <span className="ml-2 text-gray-400">Refreshing…</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name *"
          className="col-span-2 rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
        <input
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          placeholder="Legal name (defaults to display)"
          className="rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="Slug (auto)"
          className="rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
      </div>
      <button
        onClick={create}
        disabled={!ownerId || !displayName.trim() || busy}
        className="w-full rounded-md bg-black text-white px-4 py-2 text-sm disabled:opacity-50 cursor-pointer"
      >
        {busy ? "Creating…" : "Create storefront (goes live immediately)"}
      </button>
    </div>
  );
}
