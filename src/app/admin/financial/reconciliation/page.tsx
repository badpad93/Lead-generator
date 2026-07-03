"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertTriangle, ArrowLeft, Play, CheckCircle2, AlertCircle, Filter } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Exception {
  id: string;
  type: string;
  provider: string | null;
  provider_ref: string | null;
  crm_payment_id: string | null;
  crm_invoice_id: string | null;
  amount_cents: number | null;
  note: string;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_action: string | null;
  resolution_note: string | null;
}

const STATUS_FILTERS = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

const TYPE_COLORS: Record<string, string> = {
  missing_webhook: "bg-red-50 text-red-700",
  missing_provider: "bg-red-50 text-red-700",
  amount_mismatch: "bg-amber-50 text-amber-700",
  duplicate_payment: "bg-amber-50 text-amber-700",
  orphan_refund: "bg-blue-50 text-blue-700",
  wrong_invoice_link: "bg-amber-50 text-amber-700",
  stale_open_invoice: "bg-gray-100 text-gray-600",
  other: "bg-gray-100 text-gray-600",
};

export default function ReconciliationPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [items, setItems] = useState<Exception[]>([]);
  const [status, setStatus] = useState("open");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ scanned: Record<string, number>; exceptions_filed: number; finished_at: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`/api/admin/financial/reconciliation?status=${status}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [token, status]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/financial/reconciliation"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setRunning(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/cron/reconciliation", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Run failed");
    else {
      setLastRun({ scanned: body.scanned, exceptions_filed: body.exceptions_filed, finished_at: body.finished_at });
      setMessage(`Reconciliation complete — filed ${body.exceptions_filed} new exceptions.`);
      await load();
    }
    setRunning(false);
  }

  async function resolve(id: string, action: string) {
    const note = prompt(`Resolution note (optional) for action "${action}"?`, "");
    if (note === null) return;
    setSaving(id);
    setError(null);
    const res = await fetch("/api/admin/financial/reconciliation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, action, note }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Resolve failed");
    } else {
      await load();
    }
    setSaving(null);
  }

  return (
    <div className="p-6">
      <Link href="/admin/financial" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Financial Center
      </Link>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-green-primary" /> Reconciliation
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Runs daily at 5pm ET. Flags stale open invoices, missing webhook events, and duplicate payments.
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-primary hover:bg-green-hover px-4 py-2.5 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run Now
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

      {lastRun && (
        <div className="mb-4 rounded-xl border border-gray-100 bg-white p-3 text-xs text-gray-700 flex flex-wrap items-center gap-4">
          <span><strong>Last manual run:</strong> {new Date(lastRun.finished_at).toLocaleString()}</span>
          <span>Scanned: {lastRun.scanned.crm_payments || 0} payments, {lastRun.scanned.crm_invoices || 0} invoices</span>
          <span className={lastRun.exceptions_filed > 0 ? "text-red-600 font-semibold" : "text-emerald-700 font-semibold"}>
            Filed {lastRun.exceptions_filed} exceptions
          </span>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${status === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400 mb-2" />
            <p className="text-sm text-gray-500">Nothing to review — the ledger reconciles cleanly.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((x) => (
              <div key={x.id} className={`rounded-xl border p-4 ${x.resolved_at ? "border-gray-100 bg-gray-50" : "border-amber-200 bg-white"}`}>
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[x.type] || "bg-gray-100 text-gray-600"}`}>
                        {x.type.replace(/_/g, " ")}
                      </span>
                      {x.provider && <span className="text-xs text-gray-500 uppercase">{x.provider}</span>}
                      {x.amount_cents != null && (
                        <span className="text-xs font-semibold text-gray-700">
                          ${(Math.abs(Number(x.amount_cents)) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700">{x.note}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span>Detected {new Date(x.detected_at).toLocaleString()}</span>
                      {x.provider_ref && <span className="font-mono">{x.provider_ref}</span>}
                      {x.crm_payment_id && <span>payment {x.crm_payment_id.slice(0, 8)}</span>}
                      {x.crm_invoice_id && <span>invoice {x.crm_invoice_id.slice(0, 8)}</span>}
                    </div>
                  </div>
                  {!x.resolved_at && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => resolve(x.id, "reconciled")}
                        disabled={saving === x.id}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                      >
                        Reconciled
                      </button>
                      <button
                        onClick={() => resolve(x.id, "ignored")}
                        disabled={saving === x.id}
                        className="rounded-lg border border-gray-200 hover:bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 cursor-pointer disabled:opacity-50"
                      >
                        Ignore
                      </button>
                    </div>
                  )}
                  {x.resolved_at && (
                    <div className="text-xs text-gray-500 text-right">
                      <p className="font-medium capitalize">{x.resolution_action?.replace(/_/g, " ")}</p>
                      <p>{new Date(x.resolved_at).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
                {x.resolution_note && (
                  <p className="text-xs text-gray-600 bg-gray-50 rounded p-2 mt-1">{x.resolution_note}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
