"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Database, AlertCircle, CheckCircle2, Play } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface PlanRow {
  source_table: string;
  source_id: string;
  action: "create" | "skip";
  reason?: string;
  provider: string;
  amount_cents: number;
  status: string;
  buyer_email?: string | null;
  created_at?: string | null;
}

interface Plan {
  cutoff: string;
  rows: PlanRow[];
  summary: {
    total: number;
    to_create: number;
    to_skip: number;
    by_source: Record<string, { create: number; skip: number }>;
  };
}

export default function BackfillPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [days, setDays] = useState(90);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/financial/backfill"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  async function preview() {
    setError(null);
    setMessage(null);
    setLoading(true);
    const res = await fetch(`/api/admin/financial/backfill?days=${days}&limit=500`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setPlan(await res.json());
    else setError((await res.json().catch(() => ({}))).error || "Preview failed");
    setLoading(false);
  }

  async function apply() {
    if (!confirm(`Apply backfill for the last ${days} days? This will create payment + invoice rows and stamp the source rows.`)) return;
    setError(null);
    setApplying(true);
    const res = await fetch("/api/admin/financial/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ days, limit: 500 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Apply failed");
    else {
      setMessage(`Applied — created ${body.summary?.to_create || 0} rows, skipped ${body.summary?.to_skip || 0}.`);
      setPlan(null);
    }
    setApplying(false);
  }

  return (
    <div className="p-6">
      <Link href="/admin/financial" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Financial Center
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Database className="h-6 w-6 text-green-primary" /> Backfill
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Hydrate the payment ledger from your existing purchase tables (lead purchases, machine listing purchases, coffee orders). Preview is safe — nothing is written until you click Apply.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cutoff (days back)</label>
            <input
              type="number"
              min="1"
              max="3650"
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
              className="w-32 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none"
            />
          </div>
          <button
            onClick={preview}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 hover:bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Preview
          </button>
          <button
            onClick={apply}
            disabled={!plan || applying}
            className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Apply
          </button>
        </div>
      </div>

      {plan && (
        <>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Total Rows Scanned" value={String(plan.summary.total)} />
              <Stat label="Will Create" value={String(plan.summary.to_create)} tone="good" />
              <Stat label="Will Skip" value={String(plan.summary.to_skip)} />
              <Stat label="Cutoff" value={new Date(plan.cutoff).toLocaleDateString()} />
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Object.entries(plan.summary.by_source).map(([src, counts]) => (
                <div key={src} className="rounded-lg border border-gray-100 p-3 text-xs">
                  <p className="font-medium text-gray-900">{src}</p>
                  <p className="text-gray-500 mt-0.5">create: {counts.create} · skip: {counts.skip}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 overflow-hidden">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Detail (first 50 rows)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 px-2 font-medium">Source</th>
                    <th className="text-left py-2 px-2 font-medium">Action</th>
                    <th className="text-left py-2 px-2 font-medium">Provider</th>
                    <th className="text-right py-2 px-2 font-medium">Amount</th>
                    <th className="text-left py-2 px-2 font-medium">Buyer</th>
                    <th className="text-left py-2 px-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.slice(0, 50).map((r) => (
                    <tr key={`${r.source_table}-${r.source_id}`} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2 px-2 text-xs text-gray-500">{r.source_table}</td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${r.action === "create" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {r.action}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs uppercase">{r.provider}</td>
                      <td className="py-2 px-2 text-right font-semibold text-emerald-700">
                        ${(r.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500">{r.buyer_email || "—"}</td>
                      <td className="py-2 px-2 text-xs text-gray-500">{r.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.rows.length > 50 && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                {plan.rows.length - 50} more rows omitted from preview. Apply processes all of them.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${tone === "good" ? "text-emerald-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
