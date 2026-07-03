"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, RotateCcw, ArrowLeft, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { REFUND_REASONS, type RefundReasonCode } from "@/lib/refundReasons";

interface Refund {
  id: string;
  provider: string;
  amount_cents: number;
  status: string;
  refund_reason: string | null;
  refunded_at: string | null;
  created_at: string;
  refund_of_payment_id: string | null;
  parent: {
    id: string;
    amount_cents: number;
    buyer_email: string | null;
    provider: string;
    method: string | null;
    paid_at: string | null;
  } | null;
}

export default function RefundsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    parent_payment_id: "",
    amount: "",
    reason_code: "customer_request" as RefundReasonCode,
    notes: "",
    is_chargeback: false,
    provider_refund_id: "",
  });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/admin/financial/refunds", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setRefunds(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/financial/refunds"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setError(null);
    setMessage(null);
    setSaving(true);
    const res = await fetch("/api/admin/financial/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        parent_payment_id: form.parent_payment_id.trim(),
        amount: Number(form.amount),
        reason_code: form.reason_code,
        notes: form.notes.trim() || null,
        is_chargeback: form.is_chargeback,
        provider_refund_id: form.provider_refund_id.trim() || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Failed to record refund");
    else {
      setMessage(form.is_chargeback ? "Chargeback recorded" : "Refund recorded");
      setForm({ parent_payment_id: "", amount: "", reason_code: "customer_request", notes: "", is_chargeback: false, provider_refund_id: "" });
      setShowForm(false);
      await load();
    }
    setSaving(false);
  }

  const inputClass = "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none";
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="p-6">
      <Link href="/admin/financial" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Financial Center
      </Link>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <RotateCcw className="h-6 w-6 text-green-primary" /> Refunds &amp; Chargebacks
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Record a refund or chargeback. Parent payment status updates automatically; commission reversal wires in Phase 4.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-primary hover:bg-green-hover px-4 py-2.5 text-sm font-semibold text-white cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Record Refund
        </button>
      </div>

      {message && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {showForm && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">New refund</h2>
          <div>
            <label className={labelClass}>Parent payment ID (from Payments list) *</label>
            <input type="text" value={form.parent_payment_id} onChange={(e) => setForm((f) => ({ ...f, parent_payment_id: e.target.value }))} className={inputClass + " font-mono"} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Amount (USD) *</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Reason *</label>
              <select value={form.reason_code} onChange={(e) => setForm((f) => ({ ...f, reason_code: e.target.value as RefundReasonCode }))} className={inputClass}>
                {REFUND_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Notes (optional)</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={`${inputClass} resize-none`} placeholder="Free-form context for the finance team." />
          </div>
          <div>
            <label className={labelClass}>Provider refund ID (optional)</label>
            <input type="text" value={form.provider_refund_id} onChange={(e) => setForm((f) => ({ ...f, provider_refund_id: e.target.value }))} className={inputClass + " font-mono"} placeholder="Stripe re_..., QB refund id, etc." />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.is_chargeback} onChange={(e) => setForm((f) => ({ ...f, is_chargeback: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
            This is a chargeback (dispute lost), not a voluntary refund
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !form.parent_payment_id.trim() || !Number(form.amount)}
              className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Record {form.is_chargeback ? "Chargeback" : "Refund"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : refunds.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No refunds or chargebacks recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left py-2 px-2 font-medium">Type</th>
                <th className="text-left py-2 px-2 font-medium">Parent</th>
                <th className="text-right py-2 px-2 font-medium">Amount</th>
                <th className="text-left py-2 px-2 font-medium">Reason</th>
                <th className="text-left py-2 px-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="py-2 px-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${r.status === "chargeback" ? "bg-red-100 text-red-800" : "bg-blue-50 text-blue-700"}`}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-700">
                    {r.parent ? (
                      <>
                        <p className="font-mono text-[10px]">{r.parent.id.slice(0, 8)}…</p>
                        <p className="text-gray-500">{r.parent.buyer_email || "—"}</p>
                      </>
                    ) : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-semibold text-red-700">
                    ${(Math.abs(Number(r.amount_cents)) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-700 max-w-xs truncate" title={r.refund_reason || ""}>
                    {r.refund_reason || "—"}
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-500">
                    {r.refunded_at ? new Date(r.refunded_at).toLocaleDateString() : new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
