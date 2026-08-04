"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, ChevronLeft, Users, AlertTriangle, Check, Eye, ArrowRight } from "lucide-react";

interface Row {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  normalized_email: string | null;
  normalized_business_name: string | null;
  normalized_phone: string | null;
  created_at: string;
  quote_count: number;
  order_count: number;
  paid_order_count: number;
  deal_count: number;
  workflow_count: number;
}

interface Cluster {
  key: string;
  match_type: "email" | "name+phone";
  rows: Row[];
}

export default function DuplicateAccountsPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [canonicalId, setCanonicalId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [notes, setNotes] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    const res = await fetch("/api/admin/sales-accounts/duplicates", {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const data = await res.json();
      setClusters(data.clusters ?? []);
      setTotalAccounts(data.total_accounts_flagged ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
        load(session.access_token);
      }
    });
  }, [load]);

  function openCluster(c: Cluster) {
    setSelectedCluster(c);
    // Default canonical = row with the most paid orders, tie-break by
    // total FK count, tie-break by oldest. This is a suggestion; the
    // admin still confirms.
    const scored = [...c.rows].sort((a, b) => {
      if (a.paid_order_count !== b.paid_order_count) return b.paid_order_count - a.paid_order_count;
      const aTotal = a.quote_count + a.order_count + a.deal_count + a.workflow_count;
      const bTotal = b.quote_count + b.order_count + b.deal_count + b.workflow_count;
      if (aTotal !== bTotal) return bTotal - aTotal;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    setCanonicalId(scored[0]?.id ?? null);
    setPreview(null);
    setNotes("");
  }

  async function runPreview() {
    if (!selectedCluster || !canonicalId || !token) return;
    setPreviewing(true);
    const absorbed = selectedCluster.rows.filter((r) => r.id !== canonicalId).map((r) => r.id);
    const res = await fetch("/api/admin/sales-accounts/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ canonical_id: canonicalId, absorbed_ids: absorbed, dry_run: true }),
    });
    if (res.ok) {
      const data = await res.json();
      setPreview(data.preview ?? {});
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({ type: "error", msg: err.error ?? "Preview failed" });
    }
    setPreviewing(false);
  }

  async function confirmMerge() {
    if (!selectedCluster || !canonicalId || !token) return;
    const absorbed = selectedCluster.rows.filter((r) => r.id !== canonicalId).map((r) => r.id);
    const canonicalRow = selectedCluster.rows.find((r) => r.id === canonicalId);
    const ok = window.confirm(
      `Merge ${absorbed.length} row(s) into "${canonicalRow?.business_name ?? canonicalId.slice(0, 8)}"?\n\n` +
      `This soft-deletes the absorbed rows and repoints every foreign key to the canonical row. ` +
      `Rollback is available from the merge log if you need to reverse it.`,
    );
    if (!ok) return;

    setMerging(true);
    const res = await fetch("/api/admin/sales-accounts/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        canonical_id: canonicalId,
        absorbed_ids: absorbed,
        notes: notes || undefined,
      }),
    });
    setMerging(false);
    if (res.ok) {
      setToast({ type: "success", msg: `Merged ${absorbed.length} row(s) successfully` });
      setSelectedCluster(null);
      setCanonicalId(null);
      setPreview(null);
      if (token) load(token);
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({ type: "error", msg: err.error ?? "Merge failed" });
    }
    setTimeout(() => setToast(null), 5000);
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ChevronLeft className="h-4 w-4" /> Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Users className="h-6 w-6 text-amber-600" />
          Duplicate Customer Accounts
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Sales accounts that resolve to the same customer identity (email, or business
          name + phone). Merging repoints every foreign key to the canonical row and
          soft-deletes the absorbed rows. All merges are logged and rollback-able.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <Loader2 className="inline h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : clusters.length === 0 ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-6 text-center">
          <Check className="mx-auto h-8 w-8 text-emerald-600 mb-2" />
          <p className="text-emerald-900 font-medium">No duplicate clusters detected.</p>
          <p className="text-sm text-emerald-700 mt-1">
            Every non-deleted sales_accounts row has a unique normalized identity.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3 text-sm text-amber-800 bg-amber-50 rounded-lg border border-amber-200 p-3">
            <AlertTriangle className="h-4 w-4" />
            <span>
              <strong>{clusters.length}</strong> cluster{clusters.length === 1 ? "" : "s"} covering{" "}
              <strong>{totalAccounts}</strong> account rows.
            </span>
          </div>

          <div className="space-y-3">
            {clusters.map((c) => {
              const totalFK = c.rows.reduce(
                (s, r) => s + r.quote_count + r.order_count + r.deal_count + r.workflow_count,
                0,
              );
              return (
                <div key={c.key} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                          {c.match_type}
                        </span>
                        <span className="text-xs text-gray-500 truncate max-w-md">
                          {c.match_type === "email" ? c.key : c.key.split("|")[0]}
                        </span>
                      </div>
                      <div className="text-sm text-gray-900">
                        <strong>{c.rows.length}</strong> row{c.rows.length === 1 ? "" : "s"} · {totalFK} linked record{totalFK === 1 ? "" : "s"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCluster(c)}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-700"
                    >
                      <Eye className="h-3 w-3" /> Review
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {selectedCluster && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl my-8">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Review cluster</h2>
              <button
                type="button"
                onClick={() => { setSelectedCluster(null); setCanonicalId(null); setPreview(null); }}
                className="text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-500">
                Pick which row becomes the canonical account. The rest get soft-deleted and their
                foreign keys are repointed here. Absorbed rows can be un-deleted with the rollback endpoint.
              </p>

              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {selectedCluster.rows.map((r) => {
                  const isCanonical = r.id === canonicalId;
                  return (
                    <label
                      key={r.id}
                      className={`flex items-start gap-3 p-3 cursor-pointer ${
                        isCanonical ? "bg-emerald-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="canonical"
                        checked={isCanonical}
                        onChange={() => setCanonicalId(r.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">
                            {r.business_name ?? "(unnamed)"}
                          </span>
                          {isCanonical && (
                            <span className="inline-flex items-center rounded-full bg-emerald-600 text-white px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium">
                              Canonical
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {r.email ?? "(no email)"} · {r.phone ?? "(no phone)"} · created {new Date(r.created_at).toLocaleDateString()}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs">
                          <FKChip label="Quotes" value={r.quote_count} />
                          <FKChip label="Orders" value={r.order_count} />
                          <FKChip label="Paid" value={r.paid_order_count} tone="emerald" />
                          <FKChip label="Deals" value={r.deal_count} />
                          <FKChip label="Workflows" value={r.workflow_count} />
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why this canonical? (audit-logged)"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                />
              </div>

              {preview && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
                    Preview — rows that will move if you confirm
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {Object.entries(preview).filter(([, v]) => v > 0).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-gray-700">
                        <span className="capitalize">{k.replace(/_/g, " ")}</span>
                        <span className="font-medium">{v}</span>
                      </div>
                    ))}
                    {Object.values(preview).every((v) => v === 0) && (
                      <div className="col-span-full text-gray-400 italic">
                        No foreign keys to move — absorbed row is orphaned data only.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={runPreview}
                  disabled={!canonicalId || previewing}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                  Preview
                </button>
                <button
                  type="button"
                  onClick={confirmMerge}
                  disabled={!canonicalId || merging}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Confirm merge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 rounded-lg shadow-lg px-4 py-3 text-sm font-medium ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function FKChip({ label, value, tone }: { label: string; value: number; tone?: "emerald" }) {
  const cls = value === 0
    ? "bg-gray-100 text-gray-400"
    : tone === "emerald"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${cls}`}>
      {label} <strong>{value}</strong>
    </span>
  );
}
