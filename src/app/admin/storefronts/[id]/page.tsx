"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface Tenant {
  id: string;
  slug: string;
  display_name: string;
  legal_name: string;
  status: string;
  approved_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  base_pricing_tier_id: string | null;
  tax_status: string;
  qb_vendor_ref: string | null;
  qb_customer_ref: string | null;
  owner_profile_id: string;
}

interface OwnerProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface OwnerOption extends OwnerProfile {
  role: string | null;
  coffee_agreement_signed: boolean;
  owns_storefront: boolean;
}

export default function AdminStorefrontDetailPage() {
  const params = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [tiers, setTiers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const [tenantRes, tierRes] = await Promise.all([
      fetch(`/api/admin/storefronts/tenants/${params.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      }),
      // The tier list comes from the admin tier-price matrix route.
      // This used to hit /api/coffee/pricing-tiers, WHICH DOES NOT
      // EXIST — the 404 was swallowed, the dropdown rendered with
      // only "— unassigned —", and every "assignment" silently sent
      // null. If tiers can't load, say so loudly instead.
      fetch("/api/admin/coffee/tier-prices", {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      }),
    ]);
    if (tenantRes.ok) {
      const body = (await tenantRes.json()) as { tenant: Tenant; owner?: OwnerProfile | null };
      setTenant(body.tenant);
      setOwner(body.owner ?? null);
    }
    if (tierRes.ok) {
      const body = (await tierRes.json()) as { tiers?: Array<{ id: string; name: string }> };
      setTiers(body.tiers ?? []);
    } else {
      setError(
        "Couldn't load pricing tiers — the tier dropdown is unavailable. Reload the page; if this persists the tier assignment cannot work.",
      );
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(body: Record<string, unknown>, successNotice?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/storefronts/tenants/${params.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Action failed");
      }
      await load();
      // Every action confirms visibly — a silent no-op is how the
      // unassigned-tier state went unnoticed in production.
      setNotice(successNotice ?? "Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-8">Loading…</div>;
  if (!tenant) return <div className="p-8 text-red-700">Not found</div>;

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <Link href="/admin/storefronts" className="text-sm text-gray-500">
        ← Storefronts
      </Link>
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{tenant.display_name}</h1>
            <div className="text-sm text-gray-600">{tenant.legal_name}</div>
            <div className="text-sm mt-1">
              Slug: <code>{tenant.slug}</code> · Status:{" "}
              <span
                className={
                  tenant.status === "approved"
                    ? "text-green-700"
                    : tenant.status === "suspended"
                      ? "text-red-700"
                      : "text-amber-700"
                }
              >
                {tenant.status}
              </span>
            </div>
          </div>
          <Link
            href={`/admin/storefronts/${params.id}/brand`}
            className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
          >
            Edit brand & appearance
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded border border-green-200 bg-green-50 p-3 text-green-800 text-sm">
          ✓ {notice}
        </div>
      ) : null}

      <section className="rounded border border-gray-200 p-4">
        <div className="font-medium">Lifecycle</div>
        <div className="mt-3 flex gap-2">
          <button
            disabled={busy || tenant.status === "approved"}
            onClick={() => {
              // Warn (not block) on approving an unpriced tenant: a
              // deliberate list-price storefront is a valid setup and
              // the tier is often assigned seconds later on this same
              // page — but approving without one silently broke live
              // checkout once, so the accidental path needs a stop.
              if (
                !tenant.base_pricing_tier_id &&
                !confirm(
                  "This storefront has NO pricing tier assigned.\n\n" +
                    "Without a tier, checkout falls back to product list prices: " +
                    "products missing a list price will FAIL at checkout, and the " +
                    "owner earns $0 margin on the rest.\n\n" +
                    "You can assign a tier in the Pricing tier section below.\n\n" +
                    "Approve anyway?",
                )
              ) {
                return;
              }
              void action({ action: "approve", reason });
            }}
            className="rounded bg-green-600 text-white px-3 py-1 text-sm disabled:opacity-50"
          >
            Approve
          </button>
          <button
            disabled={busy || tenant.status === "closed"}
            onClick={() => {
              if (!reason.trim()) {
                setError("Reason is required to suspend");
                return;
              }
              void action({ action: "suspend", reason });
            }}
            className="rounded bg-amber-600 text-white px-3 py-1 text-sm disabled:opacity-50"
          >
            Suspend
          </button>
          <button
            disabled={busy || tenant.status === "closed"}
            onClick={() => action({ action: "close", reason })}
            className="rounded bg-red-600 text-white px-3 py-1 text-sm disabled:opacity-50"
          >
            Close
          </button>
        </div>
        <input
          className="mt-2 w-full border rounded px-3 py-1 text-sm"
          placeholder="Reason (mandatory for suspend)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </section>

      <section className="rounded border border-gray-200 p-4">
        <div className="font-medium">Owner</div>
        <div className="mt-2 text-sm text-gray-700">
          {owner ? (
            <>
              {owner.full_name ?? "—"}{" "}
              <span className="text-gray-500">({owner.email ?? tenant.owner_profile_id})</span>
            </>
          ) : (
            <code className="text-xs">{tenant.owner_profile_id}</code>
          )}
        </div>
        <OwnerReassignPicker
          busy={busy}
          onAssign={(ownerProfileId) =>
            action({ action: "assign_owner", owner_profile_id: ownerProfileId, reason })
          }
        />
      </section>

      <section className="rounded border border-gray-200 p-4">
        <div className="font-medium">Pricing tier</div>
        {!tenant.base_pricing_tier_id ? (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
            ⚠ No pricing tier assigned
            {tenant.status === "approved" ? " on an APPROVED storefront" : ""} —
            checkout relies on bare product list prices (fails for products
            without one) unless the owner has set customer prices.
          </div>
        ) : null}
        <div className="mt-3 flex gap-2 items-center">
          <select
            className="border rounded px-2 py-1 text-sm disabled:opacity-50"
            value={tenant.base_pricing_tier_id ?? ""}
            disabled={busy || tiers.length === 0}
            onChange={(e) => {
              const tier = tiers.find((t) => t.id === e.target.value);
              void action(
                {
                  action: "assign_tier",
                  base_pricing_tier_id: e.target.value || null,
                },
                tier
                  ? `Pricing tier set to "${tier.name}".`
                  : "Pricing tier cleared (unassigned).",
              );
            }}
          >
            <option value="">— unassigned —</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {tiers.length === 0 ? (
            <span className="text-sm text-red-700">
              No tiers loaded — assignment disabled.
            </span>
          ) : null}
        </div>
      </section>

      {/* Tax-onboarding UI intentionally removed — storefront sales
          are hard-coded resale-exempt (tax always $0 in the pricing
          engine) so there is no sales-tax workflow to manage here.
          The tax_status / w9_* columns stay on the table untouched. */}

      <CustomersPanel tenantId={params.id} />

      <CommissionsPanel tenantId={params.id} />
    </div>
  );
}

interface CommissionRow {
  id: string;
  coffee_order_id: string;
  coffee_order_item_id: string;
  commission_amount: number;
  quantity: number;
  status: string;
  earned_at: string;
  paid_at: string | null;
  qb_bill_id: string | null;
  reversed_of_id: string | null;
}
interface Balances {
  pending_amount: number;
  payable_amount: number;
  scheduled_amount: number;
  paid_amount: number;
  reversed_amount: number;
  lifetime_net: number;
  pending_rows: number;
  payable_rows: number;
  scheduled_rows: number;
}

function CommissionsPanel({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [payoutRef, setPayoutRef] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const qs = new URLSearchParams({ tenant_id: tenantId });
      if (status) qs.set("status", status);
      const res = await fetch(`/api/admin/storefronts/commissions?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { rows: CommissionRow[]; balances: Balances | null };
        setRows(body.rows);
        setBalances(body.balances);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function releasePayout() {
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/storefronts/payouts/release", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      const body = (await res.json()) as {
        scheduled_rows?: number;
        qb_bill_id?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Release failed");
      setMsg(
        body.scheduled_rows
          ? `Scheduled ${body.scheduled_rows} row(s). QB Bill: ${body.qb_bill_id}`
          : "No payable rows to release.",
      );
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function markPaid() {
    if (!payoutRef.trim()) {
      setMsg("Enter the QB Bill Payment id first");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/storefronts/payouts/release", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          mark_paid_qb_bill_payment_id: payoutRef.trim(),
        }),
      });
      const body = (await res.json()) as { paid_rows?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setMsg(`Marked ${body.paid_rows ?? 0} row(s) paid.`);
      setPayoutRef("");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded border border-gray-200 p-4">
      <div className="font-medium">Commissions & payouts</div>
      {balances ? (
        <div className="mt-3 grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          <Balance label="Pending" amount={balances.pending_amount} rows={balances.pending_rows} />
          <Balance label="Payable" amount={balances.payable_amount} rows={balances.payable_rows} />
          <Balance label="Scheduled" amount={balances.scheduled_amount} rows={balances.scheduled_rows} />
          <Balance label="Paid" amount={balances.paid_amount} />
          <Balance label="Reversed" amount={balances.reversed_amount} />
          <Balance label="Lifetime net" amount={balances.lifetime_net} bold />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={releasePayout}
          disabled={busy || !balances || balances.payable_amount <= 0}
          className="rounded bg-green-600 text-white px-3 py-1 text-sm disabled:opacity-50"
        >
          Release payable → QB Bill
        </button>
        <div className="flex items-center gap-1">
          <input
            className="border rounded px-2 py-1 text-sm w-56"
            placeholder="QB Bill Payment id"
            value={payoutRef}
            onChange={(e) => setPayoutRef(e.target.value)}
          />
          <button
            onClick={markPaid}
            disabled={busy || !payoutRef}
            className="rounded bg-blue-600 text-white px-3 py-1 text-sm disabled:opacity-50"
          >
            Mark scheduled → paid
          </button>
        </div>
      </div>
      {msg ? <div className="mt-2 text-xs text-gray-700">{msg}</div> : null}

      <div className="mt-4 flex items-center gap-2 text-sm">
        <label>Filter:</label>
        <select
          className="border rounded px-2 py-1"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="payable">Payable</option>
          <option value="scheduled">Scheduled</option>
          <option value="paid">Paid</option>
          <option value="reversed">Reversed</option>
          <option value="on_hold">On hold</option>
        </select>
      </div>

      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs text-gray-500 uppercase">
          <tr>
            <th className="py-2">Earned</th>
            <th className="py-2">Order / Item</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Amount</th>
            <th className="py-2">Status</th>
            <th className="py-2">QB Bill</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="py-3 text-gray-500">
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-3 text-gray-500">
                No commission rows.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-2 text-gray-600">
                  {new Date(r.earned_at).toLocaleDateString()}
                </td>
                <td className="py-2 font-mono text-[11px]">
                  {r.coffee_order_id.slice(0, 8)} · {r.coffee_order_item_id.slice(0, 8)}
                  {r.reversed_of_id ? (
                    <span className="ml-1 text-red-600">reversal</span>
                  ) : null}
                </td>
                <td className="py-2 text-right">{r.quantity}</td>
                <td
                  className={
                    "py-2 text-right " + (r.commission_amount < 0 ? "text-red-700" : "")
                  }
                >
                  ${Number(r.commission_amount).toFixed(2)}
                </td>
                <td className="py-2">{r.status}</td>
                <td className="py-2 font-mono text-[11px]">{r.qb_bill_id ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function Balance({
  label,
  amount,
  rows,
  bold,
}: {
  label: string;
  amount: number;
  rows?: number;
  bold?: boolean;
}) {
  return (
    <div className={"rounded border p-2 " + (bold ? "border-black bg-gray-50" : "border-gray-200")}>
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className={bold ? "font-semibold" : ""}>${Number(amount).toFixed(2)}</div>
      {rows != null ? <div className="text-[10px] text-gray-500">{rows} rows</div> : null}
    </div>
  );
}

/**
 * Enrolled customers of this tenant, with admin delete. Delete is
 * the shared deleteStorefrontCustomer flow: customer-only accounts
 * are removed entirely (login killed, soft-delete fallback keeps
 * order-history FKs), other roles are unlinked from the storefront.
 */
function CustomersPanel({ tenantId }: { tenantId: string }) {
  const [customers, setCustomers] = useState<
    { id: string; full_name: string | null; email: string | null; role: string | null; storefront_enrolled_at: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/storefronts/tenants/${tenantId}/customers`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const body = (await res.json().catch(() => ({}))) as { customers?: typeof customers };
      setCustomers(body.customers ?? []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  async function remove(c: (typeof customers)[number]) {
    if (
      !confirm(
        `Delete ${c.full_name || c.email} from this storefront?\n\nCustomer-only accounts are deleted entirely; accounts with other roles are just unlinked.`,
      )
    )
      return;
    setDeleting(c.id);
    setErr(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(
        `/api/admin/storefronts/tenants/${tenantId}/customers?profile_id=${encodeURIComponent(c.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Delete failed");
      await loadCustomers();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="rounded border border-gray-200 p-4">
      <div className="font-medium">Customers</div>
      {err ? <div className="mt-2 text-sm text-red-700">{err}</div> : null}
      {loading ? (
        <div className="mt-3 text-sm text-gray-500">Loading…</div>
      ) : customers.length === 0 ? (
        <div className="mt-3 text-sm text-gray-500">No enrolled customers.</div>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-gray-500 uppercase">
            <tr>
              <th className="py-1">Customer</th>
              <th className="py-1">Role</th>
              <th className="py-1">Enrolled</th>
              <th className="py-1 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-2">
                  <div className="font-medium">{c.full_name || c.email}</div>
                  <div className="text-xs text-gray-500">{c.email}</div>
                </td>
                <td className="py-2 text-gray-600">{c.role ?? "—"}</td>
                <td className="py-2 text-gray-600">
                  {c.storefront_enrolled_at
                    ? new Date(c.storefront_enrolled_at).toLocaleDateString()
                    : "—"}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => remove(c)}
                    disabled={deleting === c.id}
                    className="text-xs text-red-700 hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    {deleting === c.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * Collapsed-by-default owner reassignment. Searches profiles via
 * /api/admin/storefronts/owners; users who already own a storefront
 * are greyed out (one tenant per owner is a DB constraint).
 */
function OwnerReassignPicker({
  busy,
  onAssign,
}: {
  busy: boolean;
  onAssign: (ownerProfileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<OwnerOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(
          `/api/admin/storefronts/owners?search=${encodeURIComponent(search)}`,
          { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } },
        );
        const body = (await res.json().catch(() => ({}))) as { owners?: OwnerOption[] };
        if (!cancelled) setOptions(body.owners ?? []);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, search]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
      >
        Reassign owner
      </button>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">Assign a different owner</span>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          Cancel
        </button>
      </div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Name or email…"
        className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm mb-2"
      />
      <div className="max-h-36 overflow-y-auto rounded border border-gray-200 divide-y divide-gray-100">
        {searching ? (
          <div className="px-2 py-2 text-xs text-gray-400">Searching…</div>
        ) : options.length === 0 ? (
          <div className="px-2 py-2 text-xs text-gray-400">No matching users.</div>
        ) : (
          options.map((o) => (
            <button
              key={o.id}
              disabled={o.owns_storefront || busy}
              onClick={() => {
                if (confirm(`Reassign this storefront to ${o.full_name ?? o.email}?`)) {
                  onAssign(o.id);
                  setOpen(false);
                }
              }}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${o.owns_storefront ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-blue-50"}`}
            >
              <span className="flex-1 min-w-0">
                <span className="font-medium text-gray-800">{o.full_name ?? o.email}</span>
                <span className="block text-gray-500 truncate">{o.email}</span>
              </span>
              {o.owns_storefront ? (
                <span className="text-[10px] text-gray-500">owns one</span>
              ) : o.coffee_agreement_signed ? (
                <span className="text-[10px] text-green-700">coffee signed</span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
