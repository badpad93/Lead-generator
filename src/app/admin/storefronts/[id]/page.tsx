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
}

export default function AdminStorefrontDetailPage() {
  const params = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tiers, setTiers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      fetch("/api/coffee/pricing-tiers"),
    ]);
    if (tenantRes.ok) {
      const body = (await tenantRes.json()) as { tenant: Tenant };
      setTenant(body.tenant);
    }
    if (tierRes.ok) {
      const body = (await tierRes.json()) as
        | { tiers?: Array<{ id: string; name: string }> }
        | Array<{ id: string; name: string }>;
      const arr = Array.isArray(body) ? body : (body.tiers ?? []);
      setTiers(arr);
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
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

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
          {error}
        </div>
      ) : null}

      <section className="rounded border border-gray-200 p-4">
        <div className="font-medium">Lifecycle</div>
        <div className="mt-3 flex gap-2">
          <button
            disabled={busy || tenant.status === "approved"}
            onClick={() => action({ action: "approve", reason })}
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
        <div className="font-medium">Pricing tier</div>
        <div className="mt-3 flex gap-2 items-center">
          <select
            className="border rounded px-2 py-1 text-sm"
            value={tenant.base_pricing_tier_id ?? ""}
            onChange={(e) =>
              action({
                action: "assign_tier",
                base_pricing_tier_id: e.target.value || null,
              })
            }
          >
            <option value="">— unassigned —</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded border border-gray-200 p-4">
        <div className="font-medium">Tax onboarding</div>
        <div className="mt-3 flex gap-2 items-center">
          <select
            className="border rounded px-2 py-1 text-sm"
            value={tenant.tax_status}
            onChange={(e) =>
              action({ patch: { tax_status: e.target.value } })
            }
          >
            <option value="not_started">Not started</option>
            <option value="submitted">W-9 submitted</option>
            <option value="approved">W-9 approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </section>

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
