"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, MapPin, CheckCircle2, XCircle, Clock, FileText, DollarSign, ShoppingCart, Info, Package } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Contract {
  id: string;
  title: string;
  tier: number;
  operator_price: number;
  market_state: string | null;
  market_city: string | null;
  machine_type: string | null;
  locations_needed: number;
  locations_filled: number;
  slots_remaining: number;
  status: string;
  billing_prepaid: boolean;
  deadline_at: string | null;
  notes: string | null;
  created_at: string;
}

interface Submission {
  id: string;
  contract_id: string;
  business_name: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  entity_type: string | null;
  square_footage: string | null;
  foot_traffic: string | null;
  employees: number | null;
  photos_count: number | null;
  admin_status: string;
  operator_status: string;
  operator_review_note: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  submission_id: string;
  amount: number;
  status: string;
  qb_invoice_id: string | null;
  triggered_at: string;
  sent_at: string | null;
  paid_at: string | null;
  paid_method: string | null;
}

function fmt(n: number): string {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SUB_STATUS_STYLE: Record<string, string> = {
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-100",
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  rejected: "bg-red-50 text-red-700 border-red-100",
};

const INV_STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700",
  sent_to_qb: "bg-blue-50 text-blue-700",
  queued: "bg-amber-50 text-amber-700",
  awaiting_collection: "bg-orange-50 text-orange-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function OperatorContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`/api/operator/contracts/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setContract(data.contract);
      setSubmissions(data.submissions || []);
      setInvoices(data.invoices || []);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to load");
    }
    setLoading(false);
  }, [token, id]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push(`/login?redirect=/operator/contracts/${id}`); return; }
      setToken(session.access_token);
    });
  }, [router, id]);

  useEffect(() => { load(); }, [load]);

  async function decide(submissionId: string, action: "accept" | "reject") {
    setSaving(`${action}-${submissionId}`);
    setError(null);
    const note = action === "reject" ? prompt("Reason for rejection (optional):") : null;
    const res = await fetch(`/api/operator/marketplace/submissions/${submissionId}/decide`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, note: note || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || `Failed to ${action}`);
    await load();
    setSaving(null);
  }

  if (loading || !contract) {
    return (
      <div className="flex justify-center py-20">
        {error ? <p className="text-sm text-red-600">{error}</p> : <Loader2 className="h-6 w-6 animate-spin text-green-primary" />}
      </div>
    );
  }

  const pending = submissions.filter((s) => s.operator_status !== "accepted" && s.operator_status !== "rejected");
  const decided = submissions.filter((s) => s.operator_status === "accepted" || s.operator_status === "rejected");
  const paidTotal = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount || 0), 0);
  const outstandingTotal = invoices.filter((i) => i.status === "sent_to_qb" || i.status === "queued").reduce((s, i) => s + Number(i.amount || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/operator/contracts" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Your Contracts
      </Link>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Contract header */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${contract.tier === 3 ? "bg-purple-100 text-purple-700" : contract.tier === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                TIER {contract.tier}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${contract.status === "fulfilled" ? "bg-emerald-100 text-emerald-700" : contract.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                {contract.status.replace(/_/g, " ")}
              </span>
              {contract.billing_prepaid && (
                <span className="rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-[10px] font-semibold">PREPAID</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{contract.title}</h1>
            <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[contract.market_city, contract.market_state].filter(Boolean).join(", ") || "Any market"}
              </span>
              <span>{contract.machine_type || "VendEra AI Machine"}</span>
              <span>{fmt(contract.operator_price)}/location</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs shrink-0">
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-gray-500 text-[10px] uppercase">Locations</p>
              <p className="text-xl font-bold text-gray-900">{contract.locations_filled}<span className="text-gray-400 text-sm"> / {contract.locations_needed}</span></p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-emerald-700 text-[10px] uppercase">Available now</p>
              <p className="text-xl font-bold text-emerald-800">{pending.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* How payment works */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 mb-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <div className="flex-1 text-xs text-blue-900">
          <p className="font-semibold mb-1">How payment works</p>
          {contract.billing_prepaid ? (
            <p>This contract is <strong>prepaid</strong> — the placement fee was collected as part of your original agreement. You won&apos;t see a separate invoice for each accepted location. Approve a submission and we take care of the rest.</p>
          ) : (
            <p>When you approve a submission, we create a QuickBooks invoice for <strong>{fmt(contract.operator_price)}</strong> and email it to you. Pay it through the QB link and we release payment to the placement provider automatically.</p>
          )}
        </div>
      </div>

      {/* Available submissions (to buy) */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-green-primary" /> Available Locations ({pending.length})
          </h2>
          {contract.slots_remaining > 0 && (
            <span className="text-xs text-gray-500">{contract.slots_remaining} slot{contract.slots_remaining === 1 ? "" : "s"} still open on this contract</span>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-6">No new locations right now — placement providers are still looking. You&apos;ll get an email when one is submitted.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium">Location</th>
                  <th className="text-left py-2 px-2 font-medium">Details</th>
                  <th className="text-left py-2 px-2 font-medium">Submitted</th>
                  <th className="text-right py-2 px-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="py-3 px-2">
                      <Link href={`/operator/marketplace/${s.id}`} className="font-medium text-gray-900 hover:text-green-primary">{s.business_name}</Link>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[s.city, s.state, s.zip].filter(Boolean).join(", ")}
                      </p>
                    </td>
                    <td className="py-3 px-2 text-xs text-gray-500">
                      {s.entity_type && <p>Type: {s.entity_type}</p>}
                      {s.employees && <p>{s.employees} employees</p>}
                      {s.foot_traffic && <p>Traffic: {s.foot_traffic}</p>}
                      {s.square_footage && <p>{s.square_footage} sq ft</p>}
                      {s.photos_count ? <p>{s.photos_count} photo{s.photos_count === 1 ? "" : "s"}</p> : null}
                    </td>
                    <td className="py-3 px-2 text-xs text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-2 text-right whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        <Link
                          href={`/operator/marketplace/${s.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 hover:bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => decide(s.id, "accept")}
                          disabled={saving === `accept-${s.id}`}
                          className="inline-flex items-center gap-1 rounded-md bg-green-primary hover:bg-green-hover px-2 py-1 text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
                          title={contract.billing_prepaid ? "Accept (prepaid — no new invoice)" : `Accept and generate a ${fmt(contract.operator_price)} invoice`}
                        >
                          {saving === `accept-${s.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShoppingCart className="h-3 w-3" />}
                          {contract.billing_prepaid ? "Accept" : `Buy · ${fmt(contract.operator_price)}`}
                        </button>
                        <button
                          onClick={() => decide(s.id, "reject")}
                          disabled={saving === `reject-${s.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 hover:bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Decided submissions */}
      {decided.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-400" /> Reviewed Submissions ({decided.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium">Location</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                  <th className="text-left py-2 px-2 font-medium">Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((s) => {
                  const st = SUB_STATUS_STYLE[s.operator_status] || "bg-gray-100 text-gray-500 border-gray-200";
                  return (
                    <tr key={s.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2 px-2">
                        <Link href={`/operator/marketplace/${s.id}`} className="font-medium text-gray-900 hover:text-green-primary">{s.business_name}</Link>
                        <p className="text-xs text-gray-500">{[s.city, s.state].filter(Boolean).join(", ")}</p>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${st}`}>
                          {s.operator_status === "accepted" ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                          {s.operator_status}
                        </span>
                        {s.operator_review_note && <p className="text-[10px] text-gray-500 italic mt-0.5">{s.operator_review_note}</p>}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice ledger */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-primary" /> Invoices &amp; Payments
          </h2>
          <div className="flex gap-4 text-xs">
            <span>Paid: <strong className="text-emerald-700">{fmt(paidTotal)}</strong></span>
            <span>Outstanding: <strong className="text-amber-700">{fmt(outstandingTotal)}</strong></span>
          </div>
        </div>
        {invoices.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-6">
            {contract.billing_prepaid
              ? "This contract is prepaid — no per-location invoices are generated."
              : "No invoices yet. One is created for each accepted location."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium">QB Invoice</th>
                  <th className="text-right py-2 px-2 font-medium">Amount</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                  <th className="text-left py-2 px-2 font-medium">Triggered</th>
                  <th className="text-left py-2 px-2 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const style = INV_STATUS_STYLE[i.status] || "bg-gray-100 text-gray-500";
                  return (
                    <tr key={i.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2 px-2 text-xs font-mono">{i.qb_invoice_id || "—"}</td>
                      <td className="py-2 px-2 text-right font-semibold">{fmt(i.amount)}</td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${style}`}>
                          {i.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500">{new Date(i.triggered_at).toLocaleDateString()}</td>
                      <td className="py-2 px-2 text-xs text-gray-500">
                        {i.paid_at ? (
                          <>
                            <p className="text-emerald-700 font-medium">{new Date(i.paid_at).toLocaleDateString()}</p>
                            {i.paid_method && <p className="text-[10px] text-gray-400">{i.paid_method}</p>}
                          </>
                        ) : i.sent_at ? (
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Sent {new Date(i.sent_at).toLocaleDateString()}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-xs text-gray-500 flex items-center gap-1">
          <FileText className="h-3 w-3" />
          Paid invoices auto-release payment to the placement provider — no action needed on your end after payment posts in QuickBooks.
        </div>
      </div>
    </div>
  );
}
