"use client";

import { useCallback, useEffect, useState } from "react";
import { Percent, Loader2, AlertTriangle, CheckCircle2, Lock } from "lucide-react";

interface OrderRow {
  id: string;
  order_number: string | null;
  total_value: number | null;
  commission_rate_bps_override: number | null;
  commission_override_note: string | null;
  commission_override_by: string | null;
  commission_override_at: string | null;
}

interface LineRow {
  id: string;
  description: string | null;
  item_type: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  commission_rate_bps_override: number | null;
  commission_override_note: string | null;
}

interface Props {
  orderId: string;
  token: string;
}

function bpsToPct(bps: number | null | undefined): string {
  if (bps == null) return "";
  return (bps / 100).toFixed(2);
}

export default function CommissionOverridePanel({ orderId, token }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [orderRatePct, setOrderRatePct] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [lineOverrides, setLineOverrides] = useState<Record<string, { pct: string; note: string }>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [adminRes, orderRes] = await Promise.all([
        fetch("/api/admin/check", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch(`/api/sales/orders/${orderId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (adminRes && adminRes.ok) {
        const admin = await adminRes.json();
        setIsAdmin(!!admin.isAdmin);
      }
      if (orderRes.ok) {
        const data = await orderRes.json();
        const o = data.order || data;
        setOrder(o);
        setOrderRatePct(bpsToPct(o.commission_rate_bps_override));
        setOrderNote(o.commission_override_note || "");
        // API returns order_items nested on the order row from select("*, order_items(*)")
        const items: LineRow[] = data.order_items || o.order_items || data.items || data.lines || [];
        setLines(items);
        const overrides: Record<string, { pct: string; note: string }> = {};
        for (const li of items) {
          overrides[li.id] = {
            pct: bpsToPct(li.commission_rate_bps_override),
            note: li.commission_override_note || "",
          };
        }
        setLineOverrides(overrides);
      }
    } catch {
      setError("Failed to load commission overrides");
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // Only send line overrides that changed.
      const changed = lines
        .map((l) => {
          const state = lineOverrides[l.id] || { pct: "", note: "" };
          const wasPct = bpsToPct(l.commission_rate_bps_override);
          if (state.pct === wasPct && state.note === (l.commission_override_note || "")) return null;
          return {
            item_id: l.id,
            rate_pct: state.pct === "" ? null : Number(state.pct),
            note: state.note || null,
          };
        })
        .filter(Boolean);

      const res = await fetch(`/api/sales/orders/${orderId}/commission`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          order_rate_pct: orderRatePct === "" ? null : Number(orderRatePct),
          order_note: orderNote || null,
          line_overrides: changed,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Save failed");
      } else {
        setMessage("Commission overrides saved");
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    // Non-admins see a read-only summary if any override is set.
    if (!order?.commission_rate_bps_override && !lines.some((l) => l.commission_rate_bps_override != null)) {
      return null;
    }
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Percent className="h-4 w-4 text-green-primary" /> Commission Overrides
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            <Lock className="h-2.5 w-2.5" /> admin managed
          </span>
        </h3>
        {order?.commission_rate_bps_override != null && (
          <p className="text-xs text-gray-600">
            Order-level: <span className="font-semibold text-emerald-700">{bpsToPct(order.commission_rate_bps_override)}%</span>
            {order.commission_override_note && <span className="text-gray-400"> — {order.commission_override_note}</span>}
          </p>
        )}
        {lines.some((l) => l.commission_rate_bps_override != null) && (
          <ul className="mt-2 space-y-1">
            {lines
              .filter((l) => l.commission_rate_bps_override != null)
              .map((l) => (
                <li key={l.id} className="text-xs text-gray-600">
                  {l.description || l.item_type || "Item"}:{" "}
                  <span className="font-semibold text-emerald-700">{bpsToPct(l.commission_rate_bps_override)}%</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Percent className="h-4 w-4 text-green-primary" /> Commission Overrides
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            <Lock className="h-2.5 w-2.5" /> admin only
          </span>
        </h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Applies to future earn events on this order. Rate resolution: line override → order override → configured rule → default.
      </p>

      {message && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {message}
        </div>
      )}
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Order-level */}
      <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-700 mb-2">Whole-order override</p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Rate %</label>
            <input
              type="number" step="0.01" min="0" max="100"
              value={orderRatePct}
              onChange={(e) => setOrderRatePct(e.target.value)}
              placeholder="e.g. 7.5"
              className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-green-primary focus:outline-none"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Note</label>
            <input
              type="text"
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Reason for override"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-green-primary focus:outline-none"
            />
          </div>
        </div>
        <p className="text-[10px] text-gray-500 mt-1">Leave blank to remove the order-level override.</p>
      </div>

      {/* Per-line */}
      {lines.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">Per-line overrides</p>
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.id} className="rounded-lg border border-gray-100 p-2 flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-xs font-medium text-gray-800">{l.description || l.item_type || "Item"}</p>
                  <p className="text-[10px] text-gray-500">
                    {l.quantity ? `${l.quantity} × ` : ""}${Number(l.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {l.total_price != null && <> = <span className="font-semibold text-gray-700">${Number(l.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></>}
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Rate %</label>
                  <input
                    type="number" step="0.01" min="0" max="100"
                    value={lineOverrides[l.id]?.pct ?? ""}
                    onChange={(e) => setLineOverrides((s) => ({ ...s, [l.id]: { pct: e.target.value, note: s[l.id]?.note || "" } }))}
                    className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                  />
                </div>
                <div className="min-w-[140px] flex-1">
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Note</label>
                  <input
                    type="text"
                    value={lineOverrides[l.id]?.note ?? ""}
                    onChange={(e) => setLineOverrides((s) => ({ ...s, [l.id]: { pct: s[l.id]?.pct || "", note: e.target.value } }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end mt-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save overrides
        </button>
      </div>
    </div>
  );
}
