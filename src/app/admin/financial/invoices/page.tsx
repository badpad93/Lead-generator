"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, FileText, ArrowLeft, Filter } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Invoice {
  id: string;
  provider: string;
  provider_invoice_id: string | null;
  provider_invoice_url: string | null;
  buyer_email: string | null;
  buyer_name: string | null;
  total_cents: number;
  amount_paid_cents: number;
  balance_due_cents: number;
  status: string;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
}

interface Summary {
  open: { count: number; balance_cents: number };
  b0_30: { count: number; balance_cents: number };
  b31_60: { count: number; balance_cents: number };
  b61_90: { count: number; balance_cents: number };
  b90_plus: { count: number; balance_cents: number };
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "partially_paid", label: "Partial" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
];

export default function InvoicesPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState("all");
  const [bucket, setBucket] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", status);
    if (bucket) params.set("bucket", bucket);
    const res = await fetch(`/api/admin/financial/invoices?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);
      setInvoices(data.invoices);
    }
    setLoading(false);
  }, [token, status, bucket]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/financial/invoices"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const fmt = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-6">
      <Link href="/admin/financial" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Financial Center
      </Link>

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="h-6 w-6 text-green-primary" /> Invoices
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Provider-agnostic invoice ledger. Aging buckets by due_date (falls back to sent_at).
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <AgingTile label="Open A/R" count={summary.open.count} balance={fmt(summary.open.balance_cents)} active={!bucket} onClick={() => setBucket(null)} />
          <AgingTile label="0-30 days" count={summary.b0_30.count} balance={fmt(summary.b0_30.balance_cents)} tone="ok" active={bucket === "0-30"} onClick={() => setBucket(bucket === "0-30" ? null : "0-30")} />
          <AgingTile label="31-60 days" count={summary.b31_60.count} balance={fmt(summary.b31_60.balance_cents)} tone="warn" active={bucket === "31-60"} onClick={() => setBucket(bucket === "31-60" ? null : "31-60")} />
          <AgingTile label="61-90 days" count={summary.b61_90.count} balance={fmt(summary.b61_90.balance_cents)} tone="alert" active={bucket === "61-90"} onClick={() => setBucket(bucket === "61-90" ? null : "61-90")} />
          <AgingTile label="90+ days" count={summary.b90_plus.count} balance={fmt(summary.b90_plus.balance_cents)} tone="critical" active={bucket === "90+"} onClick={() => setBucket(bucket === "90+" ? null : "90+")} />
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
        ) : invoices.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No invoices match the current filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left py-2 px-2 font-medium">Provider</th>
                <th className="text-left py-2 px-2 font-medium">Buyer</th>
                <th className="text-right py-2 px-2 font-medium">Total</th>
                <th className="text-right py-2 px-2 font-medium">Paid</th>
                <th className="text-right py-2 px-2 font-medium">Balance</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
                <th className="text-left py-2 px-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="py-2 px-2 text-xs text-gray-500 uppercase">{inv.provider}</td>
                  <td className="py-2 px-2 text-xs text-gray-700">{inv.buyer_name || inv.buyer_email || "—"}</td>
                  <td className="py-2 px-2 text-right font-mono text-xs">{fmt(inv.total_cents)}</td>
                  <td className="py-2 px-2 text-right font-mono text-xs text-emerald-700">{fmt(inv.amount_paid_cents)}</td>
                  <td className={`py-2 px-2 text-right font-mono text-xs font-semibold ${inv.balance_due_cents > 0 ? "text-red-600" : "text-gray-500"}`}>
                    {fmt(inv.balance_due_cents)}
                  </td>
                  <td className="py-2 px-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColor(inv.status)}`}>
                      {inv.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-500">
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
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

function AgingTile({ label, count, balance, tone, active, onClick }: { label: string; count: number; balance: string; tone?: "ok" | "warn" | "alert" | "critical"; active: boolean; onClick: () => void }) {
  const ring = active ? "ring-2 ring-green-primary" : "";
  const dot = tone === "critical" ? "bg-red-500" : tone === "alert" ? "bg-red-400" : tone === "warn" ? "bg-amber-400" : tone === "ok" ? "bg-emerald-400" : "bg-gray-300";
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border border-gray-100 bg-white p-4 text-left cursor-pointer hover:border-green-200 ${ring}`}
    >
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className="text-lg font-bold text-gray-900 mt-1">{balance}</p>
      <p className="text-xs text-gray-400">{count} invoice{count === 1 ? "" : "s"}</p>
    </button>
  );
}

function statusColor(status: string): string {
  if (status === "paid") return "bg-emerald-50 text-emerald-700";
  if (status === "open") return "bg-blue-50 text-blue-700";
  if (status === "partially_paid") return "bg-amber-50 text-amber-700";
  if (status === "overdue") return "bg-red-50 text-red-700";
  if (status === "void") return "bg-gray-100 text-gray-500";
  if (status === "written_off") return "bg-gray-100 text-gray-500";
  return "bg-gray-100 text-gray-600";
}
