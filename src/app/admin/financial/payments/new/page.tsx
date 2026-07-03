"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

const METHODS = ["ach", "wire", "cash", "check", "zelle", "venmo", "paypal", "other"] as const;
const STATUSES = ["paid", "pending", "failed"] as const;

export default function NewManualPaymentPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [proof, setProof] = useState<{ bucket: string; path: string; file_name: string } | null>(null);

  const [form, setForm] = useState({
    amount: "",
    method: "ach" as (typeof METHODS)[number],
    status: "paid" as (typeof STATUSES)[number],
    order_id: "",
    agreement_id: "",
    invoice_id: "",
    buyer_email: "",
    reference: "",
    note: "",
    reason: "",
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/financial/payments/new"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  async function uploadProof(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/financial/payments/proof", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Upload failed");
    else setProof(body);
    setUploading(false);
  }

  async function save() {
    setError(null);
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) { setError("Amount must be a positive number (in dollars)"); return; }
    if (!form.buyer_email && !form.order_id && !form.agreement_id) {
      setError("Add at least one of: buyer email, order id, or agreement id");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/financial/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        amount: amt,
        method: form.method,
        status: form.status,
        order_id: form.order_id.trim() || null,
        agreement_id: form.agreement_id.trim() || null,
        invoice_id: form.invoice_id.trim() || null,
        buyer_email: form.buyer_email.trim() || null,
        reference: form.reference.trim() || null,
        note: form.note.trim() || null,
        reason: form.reason.trim() || null,
        proof_bucket: proof?.bucket,
        proof_path: proof?.path,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || "Save failed"); setSaving(false); return; }
    router.push("/admin/financial/payments");
  }

  const inputClass = "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none";
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/admin/financial/payments" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Payments
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Record Manual Payment</h1>
      <p className="text-sm text-gray-500 mb-6">
        For ACH, wire, cash, check, Zelle, Venmo, or other off-provider payments. Attach a proof of receipt.
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Amount (USD) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Method *</label>
              <select
                value={form.method}
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as (typeof METHODS)[number] }))}
                className={inputClass}
              >
                {METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status *</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as (typeof STATUSES)[number] }))}
                className={inputClass}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Link to CRM entity (at least one)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Order ID</label>
              <input type="text" value={form.order_id} onChange={(e) => setForm((f) => ({ ...f, order_id: e.target.value }))} className={inputClass + " font-mono"} />
            </div>
            <div>
              <label className={labelClass}>Agreement ID</label>
              <input type="text" value={form.agreement_id} onChange={(e) => setForm((f) => ({ ...f, agreement_id: e.target.value }))} className={inputClass + " font-mono"} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Buyer Email</label>
              <input type="email" value={form.buyer_email} onChange={(e) => setForm((f) => ({ ...f, buyer_email: e.target.value }))} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Proof of receipt</h3>
          {proof ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-900">{proof.file_name}</p>
                <p className="text-xs text-emerald-700">Uploaded to payment-proofs bucket</p>
              </div>
              <button
                type="button"
                onClick={() => setProof(null)}
                className="text-xs text-emerald-700 hover:underline"
              >
                Replace
              </button>
            </div>
          ) : (
            <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-6 cursor-pointer hover:bg-gray-50 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? <Loader2 className="h-6 w-6 text-gray-400 animate-spin" /> : <Upload className="h-6 w-6 text-gray-400" />}
              <p className="text-sm font-medium text-gray-700">{uploading ? "Uploading…" : "Click to upload PDF, PNG, JPG"}</p>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadProof(f); e.currentTarget.value = ""; }}
              />
            </label>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-3">
          <div>
            <label className={labelClass}>Reference / confirmation #</label>
            <input type="text" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} className={inputClass} placeholder="Check #, ACH trace ID, etc." />
          </div>
          <div>
            <label className={labelClass}>Reason (why manual)</label>
            <input type="text" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className={inputClass} placeholder="e.g. Wire transfer arrived, entering manually" />
          </div>
          <div>
            <label className={labelClass}>Note (internal only)</label>
            <textarea rows={3} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={`${inputClass} resize-none`} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Link
            href="/admin/financial/payments"
            className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </Link>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-3 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record Payment
          </button>
        </div>
      </div>
    </div>
  );
}
