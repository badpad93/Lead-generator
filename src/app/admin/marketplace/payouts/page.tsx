"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, DollarSign, Filter, ArrowLeft, RefreshCw, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Payout {
  id: string;
  submission_id: string;
  contract_id: string;
  partner_id: string;
  amount: number;
  currency: string;
  status: string;
  qb_bill_id: string | null;
  qb_error: string | null;
  qb_last_attempt_at: string | null;
  triggered_at: string;
  sent_at: string | null;
  paid_at: string | null;
  contract: { title: string; tier: number } | null;
  partner: { business_name: string | null } | null;
  submission: { business_name: string; city: string | null; state: string | null } | null;
}

interface OpInvoice {
  id: string;
  submission_id: string;
  contract_id: string;
  operator_business_name: string | null;
  operator_email: string | null;
  amount: number;
  currency: string;
  status: string;
  qb_invoice_id: string | null;
  qb_error: string | null;
  qb_last_attempt_at: string | null;
  triggered_at: string;
  sent_at: string | null;
  paid_at: string | null;
  contract: { title: string; tier: number } | null;
  submission: { business_name: string; city: string | null; state: string | null } | null;
}

const FILTERS = [
  { key: "queued", label: "Queued" },
  { key: "sent_to_qb", label: "Sent" },
  { key: "paid", label: "Paid" },
  { key: "failed", label: "Failed" },
  { key: "all", label: "All" },
];

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-amber-50 text-amber-700",
  sent_to_qb: "bg-blue-50 text-blue-700",
  paid: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

type Tab = "payouts" | "invoices";

export default function AdminPayoutsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<Tab>("payouts");
  const [status, setStatus] = useState("queued");
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [invoices, setInvoices] = useState<OpInvoice[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const endpoint = tab === "payouts" ? "payouts" : "operator-invoices";
    const params = new URLSearchParams();
    params.set("status", status);
    const res = await fetch(`/api/admin/marketplace/${endpoint}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (tab === "payouts") setPayouts(data);
      else setInvoices(data);
    }
    setLoading(false);
  }, [token, tab, status]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/payouts"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function drainAll() {
    setSaving("drain");
    setMessage(null);
    setError(null);
    const endpoint = tab === "payouts" ? "payouts" : "operator-invoices";
    const res = await fetch(`/api/admin/marketplace/${endpoint}/drain`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Drain failed");
    else setMessage(`Drained: ${body.succeeded} succeeded, ${body.failed} failed of ${body.attempted} attempted`);
    await load();
    setSaving(null);
  }

  async function retry(id: string) {
    setSaving(`retry-${id}`);
    setMessage(null);
    setError(null);
    const endpoint = tab === "payouts" ? "payouts" : "operator-invoices";
    const res = await fetch(`/api/admin/marketplace/${endpoint}/${id}/retry`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Retry failed");
    else setMessage(`Sent to QuickBooks (${body.qb_bill_id || body.qb_invoice_id})`);
    await load();
    setSaving(null);
  }

  const rows = tab === "payouts" ? payouts : invoices;

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-green-primary" /> Marketplace Money
          </h1>
          <p className="text-sm text-gray-500 mt-1">Payouts owed to placement partners and invoices billed to operators. QuickBooks handles both.</p>
        </div>
        <button
          onClick={drainAll}
          disabled={saving === "drain"}
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-primary hover:bg-green-hover px-4 py-2.5 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
        >
          {saving === "drain" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Drain to QuickBooks
        </button>
      </div>

      <div className="mb-4 flex gap-1 border-b border-gray-100">
        {(["payouts", "invoices"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${tab === t ? "border-green-primary text-green-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {t === "payouts" ? "Partner Payouts (Bills)" : "Operator Invoices"}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${status === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
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

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <DollarSign className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-lg font-semibold text-gray-900 mb-1">Nothing here</p>
          <p className="text-sm text-gray-500">
            {tab === "payouts" ? "Partner payouts appear when operators accept submissions." : "Operator invoices appear when operators accept submissions."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Recipient</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Contract</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Location</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">QB Ref</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Triggered</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tab === "payouts" && payouts.map((p) => (
                <tr key={p.id} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-gray-700">{p.partner?.business_name || `Partner #${p.partner_id.slice(0, 8)}`}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{p.contract?.title || "—"}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{p.submission ? `${p.submission.business_name} · ${[p.submission.city, p.submission.state].filter(Boolean).join(", ")}` : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">${Number(p.amount).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[p.status] || "bg-gray-100 text-gray-600"}`}>
                      {p.status.replace(/_/g, " ")}
                    </span>
                    {p.qb_error && <p className="text-[10px] text-red-500 mt-1 max-w-xs truncate" title={p.qb_error}>{p.qb_error}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{p.qb_bill_id || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(p.triggered_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {(p.status === "queued" || p.status === "failed") && (
                      <button
                        onClick={() => retry(p.id)}
                        disabled={saving === `retry-${p.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 hover:bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 cursor-pointer disabled:opacity-50"
                      >
                        {saving === `retry-${p.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Send
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {tab === "invoices" && invoices.map((i) => (
                <tr key={i.id} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-gray-700">{i.operator_business_name || "—"}<div className="text-xs text-gray-400">{i.operator_email}</div></td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{i.contract?.title || "—"}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{i.submission ? `${i.submission.business_name} · ${[i.submission.city, i.submission.state].filter(Boolean).join(", ")}` : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">${Number(i.amount).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[i.status] || "bg-gray-100 text-gray-600"}`}>
                      {i.status.replace(/_/g, " ")}
                    </span>
                    {i.qb_error && <p className="text-[10px] text-red-500 mt-1 max-w-xs truncate" title={i.qb_error}>{i.qb_error}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{i.qb_invoice_id || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(i.triggered_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {(i.status === "queued" || i.status === "failed") && (
                      <button
                        onClick={() => retry(i.id)}
                        disabled={saving === `retry-${i.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 hover:bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 cursor-pointer disabled:opacity-50"
                      >
                        {saving === `retry-${i.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Send
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
