"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Package,
  CheckCircle2,
  Truck,
  AlertTriangle,
  Upload,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

/**
 * Manufacturer / Wholesaler fulfillment portal.
 *
 * Lists all machine_listing_purchases assigned to the caller.
 * Inline actions: Acknowledge, Ship (carrier + tracking + optional
 * serial numbers + notes), Mark Delivered, Report Issue, Upload BOL.
 *
 * Two-gate payout release is visible per row:
 *   payment_settled + shipped both ✓ → payout status advances.
 */

interface Order {
  id: string;
  created_at: string;
  machine_listing_id: string;
  amount_cents: number;
  manufacturer_proceeds_cents: number | null;
  vc_margin_cents: number | null;
  fulfillment_status: string;
  acknowledged_at: string | null;
  estimated_ship_date: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  carrier: string | null;
  tracking_number: string | null;
  serial_numbers: string[] | null;
  fulfillment_notes: string | null;
  issue_reason: string | null;
  payment_settled_at: string | null;
  manufacturer_payout_status: string;
  payout_released_at: string | null;
  payout_error: string | null;
  bol_uploaded: boolean;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  location_business_name: string | null;
  location_address: string | null;
  location_city: string | null;
  location_state: string | null;
  location_zip: string | null;
  site_contact_name: string | null;
}

export default function ManufacturerOrdersPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers = new Headers(init.headers);
    if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
    return fetch(url, { ...init, headers });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAuthed(false);
        router.push("/signup?next=/manufacturer/orders");
        return;
      }
      setAuthed(true);
      const res = await authFetch("/api/manufacturer/me/orders");
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `Failed (HTTP ${res.status})`);
      else setOrders(data.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setLoading(false);
  }, [authFetch, router]);

  useEffect(() => { void load(); }, [load]);

  async function runAction(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await authFetch(`/api/manufacturer/me/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? `Failed (HTTP ${res.status})`);
      else void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusyId(null);
  }

  async function handleAcknowledge(id: string) {
    await runAction(id, { action: "acknowledge" });
  }

  async function handleReportIssue(id: string) {
    const reason = window.prompt("Describe the issue (required):", "");
    if (reason === null) return;
    if (!reason.trim()) return;
    await runAction(id, { action: "report_issue", issue_reason: reason.trim() });
  }

  async function handleMarkDelivered(id: string) {
    if (!window.confirm("Mark this order as delivered?")) return;
    await runAction(id, { action: "mark_delivered" });
  }

  async function handleUploadBol(id: string, file: File) {
    setBusyId(id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch(`/api/manufacturer/me/orders/${id}/bol`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? `Failed (HTTP ${res.status})`);
      else void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusyId(null);
  }

  if (authed === false) return null;
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light">
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-green-600" /> Loading orders…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light py-8 px-4">
      <div className="mx-auto max-w-6xl">
        <Link href="/manufacturer/apply" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to my application
        </Link>
        <div className="flex items-center gap-2 mb-6">
          <Package className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Fulfillment Portal</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {orders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
            No orders yet. When customers purchase your listed equipment they&apos;ll show up here.
          </div>
        )}

        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <FulfillmentPill status={o.fulfillment_status} />
                    <PayoutPill status={o.manufacturer_payout_status} />
                    <span className="text-xs text-gray-400 font-mono">
                      #{o.id.slice(0, 8)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {o.business_name || o.full_name || "—"}
                  </p>
                  <p className="text-xs text-gray-500">{o.email} · {o.phone}</p>
                  {(o.location_address || o.location_city) && (
                    <p className="mt-1 text-xs text-gray-500">
                      Ship to: {[o.location_business_name, o.location_address, o.location_city, o.location_state, o.location_zip].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Your proceeds</p>
                  <p className="text-lg font-bold text-green-700">
                    {o.manufacturer_proceeds_cents != null ? `$${(o.manufacturer_proceeds_cents / 100).toLocaleString()}` : "—"}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    on ${(o.amount_cents / 100).toLocaleString()} order
                  </p>
                </div>
              </div>

              {/* Two-gate progress */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <GateRow
                  label="Customer payment settled"
                  when={o.payment_settled_at}
                />
                <GateRow
                  label="Manufacturer marked shipped"
                  when={o.shipped_at}
                />
              </div>

              {o.payout_released_at && (
                <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                  <CheckCircle2 className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                  Payout released via Dwolla on {new Date(o.payout_released_at).toLocaleString()}
                </div>
              )}
              {o.payout_error && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Payout blocked: {o.payout_error}
                </div>
              )}

              {o.tracking_number && (
                <p className="mt-3 text-xs text-gray-600">
                  <span className="font-semibold">{o.carrier}</span> · Tracking:{" "}
                  <span className="font-mono">{o.tracking_number}</span>
                </p>
              )}
              {o.issue_reason && (
                <p className="mt-2 text-xs text-red-700">
                  <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                  Issue: {o.issue_reason}
                </p>
              )}

              {/* Actions */}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                {o.fulfillment_status === "new" && (
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() => handleAcknowledge(o.id)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge
                  </button>
                )}
                {(o.fulfillment_status === "acknowledged" || o.fulfillment_status === "processing" || o.fulfillment_status === "new") && (
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                  >
                    <Truck className="h-3.5 w-3.5" /> {expandedId === o.id ? "Cancel" : "Mark Shipped"}
                  </button>
                )}
                {o.fulfillment_status === "shipped" && (
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() => handleMarkDelivered(o.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Mark Delivered
                  </button>
                )}
                {o.fulfillment_status !== "delivered" && o.fulfillment_status !== "cancelled" && o.fulfillment_status !== "refunded" && (
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() => handleReportIssue(o.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Report Issue
                  </button>
                )}
                <label className={`inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer ${busyId === o.id ? "opacity-50 cursor-not-allowed" : ""}`}>
                  <Upload className="h-3.5 w-3.5" />
                  {o.bol_uploaded ? "Replace BOL" : "Upload BOL"}
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="hidden"
                    disabled={busyId === o.id}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadBol(o.id, f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              {expandedId === o.id && (
                <ShipForm
                  onCancel={() => setExpandedId(null)}
                  onSubmit={async (payload) => {
                    await runAction(o.id, { action: "ship", ...payload });
                    setExpandedId(null);
                  }}
                  busy={busyId === o.id}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShipForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [eta, setEta] = useState("");
  const [serials, setSerials] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="mt-4 rounded-lg border border-green-200 bg-green-50/60 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-600">Carrier <span className="text-red-500">*</span></span>
          <input type="text" value={carrier} onChange={(e) => setCarrier(e.target.value)} className={inputClass} placeholder="e.g. FedEx Freight, R+L, UPS" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-600">Tracking / PRO number <span className="text-red-500">*</span></span>
          <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-600">Estimated ship / delivery date</span>
          <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-600">Serial numbers</span>
          <input type="text" value={serials} onChange={(e) => setSerials(e.target.value)} className={inputClass} placeholder="Comma-separated" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-gray-600">Notes</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !carrier.trim() || !tracking.trim()}
          onClick={() =>
            onSubmit({
              carrier: carrier.trim(),
              tracking_number: tracking.trim(),
              estimated_ship_date: eta || null,
              serial_numbers: serials
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              fulfillment_notes: notes.trim() || null,
            })
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Mark Shipped
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

function GateRow({ label, when }: { label: string; when: string | null }) {
  const ok = !!when;
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${ok ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"}`}>
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
      ) : (
        <div className="h-3.5 w-3.5 rounded-full border border-gray-300 shrink-0" />
      )}
      <span className={ok ? "text-green-800" : "text-gray-500"}>
        {label}
        {ok && when && ` — ${new Date(when).toLocaleDateString()}`}
      </span>
    </div>
  );
}

function FulfillmentPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-blue-50 text-blue-700",
    acknowledged: "bg-purple-50 text-purple-700",
    processing: "bg-purple-50 text-purple-700",
    shipped: "bg-green-50 text-green-700",
    delivered: "bg-green-100 text-green-800 font-semibold",
    cancelled: "bg-gray-100 text-gray-500 line-through",
    refunded: "bg-gray-100 text-gray-500",
    partially_refunded: "bg-gray-100 text-gray-500",
    issue: "bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? map.new}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function PayoutPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-gray-100 text-gray-500",
    awaiting_gates: "bg-orange-50 text-orange-700",
    ready: "bg-yellow-50 text-yellow-800",
    sent_to_dwolla: "bg-blue-50 text-blue-700",
    paid: "bg-green-100 text-green-800 font-semibold",
    blocked: "bg-red-50 text-red-700",
    failed: "bg-red-50 text-red-700",
    cancelled: "bg-gray-100 text-gray-500",
  };
  const label = {
    pending: "Payout: pending",
    awaiting_gates: "Payout: awaiting gates",
    ready: "Payout: queued",
    sent_to_dwolla: "Payout: in ACH",
    paid: "Payout: paid",
    blocked: "Payout: blocked",
    failed: "Payout: failed",
    cancelled: "Payout: cancelled",
  }[status] ?? `Payout: ${status}`;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? map.pending}`}>
      {label}
    </span>
  );
}
