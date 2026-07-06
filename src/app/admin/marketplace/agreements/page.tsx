"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, FileSignature, ArrowLeft, Filter, CheckCircle2, AlertCircle, XCircle, Undo2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface AgreementRow {
  id: string;
  user_id: string;
  status: string;
  agreement_version: number;
  provider_signed_at: string | null;
  provider_typed_name: string | null;
  provider_email_snapshot: string | null;
  countersigned_at: string | null;
  countersigner_name_snapshot: string | null;
  decline_reason: string | null;
  correction_request_reason: string | null;
  admin_override_reason: string | null;
  created_at: string;
  user: { id: string; full_name: string | null; email: string | null; company_name: string | null } | null;
  template: { id: string; version: number; title: string; effective_date: string } | null;
}

const FILTERS = [
  { key: "provider_signed_pending_company_countersign", label: "Pending countersign" },
  { key: "fully_executed", label: "Fully executed" },
  { key: "correction_requested", label: "Correction requested" },
  { key: "declined", label: "Declined" },
  { key: "legacy_approved", label: "Legacy approved" },
  { key: "any", label: "All" },
];

const STATUS_STYLES: Record<string, string> = {
  provider_signed_pending_company_countersign: "bg-amber-50 text-amber-700 border-amber-100",
  fully_executed: "bg-emerald-50 text-emerald-700 border-emerald-100",
  correction_requested: "bg-orange-50 text-orange-700 border-orange-100",
  declined: "bg-red-50 text-red-700 border-red-100",
  legacy_approved: "bg-gray-100 text-gray-500 border-gray-200",
  not_started: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function AdminAgreementsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AgreementRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("provider_signed_pending_company_countersign");
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "any") params.set("status", statusFilter);
    const res = await fetch(`/api/admin/marketplace/agreements?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [token, statusFilter]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/agreements"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function countersign(row: AgreementRow) {
    if (!confirm(`Countersign the Placement Provider Agreement for ${row.user?.full_name || row.user?.email}?`)) return;
    setSaving(`countersign-${row.id}`);
    setError(null); setMessage(null);
    const res = await fetch(`/api/admin/marketplace/agreements/${row.id}/countersign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Countersign failed");
    else setMessage("Agreement fully executed. Provider notified.");
    await load();
    setSaving(null);
  }

  async function declineOrCorrect(row: AgreementRow, action: "decline" | "request_correction") {
    const label = action === "decline" ? "decline" : "request correction";
    const reason = prompt(`Reason to ${label}?`, "");
    if (!reason) return;
    setSaving(`${action}-${row.id}`);
    setError(null); setMessage(null);
    const res = await fetch(`/api/admin/marketplace/agreements/${row.id}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, reason }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || `Failed to ${label}`);
    else setMessage(action === "decline" ? "Agreement declined" : "Correction requested");
    await load();
    setSaving(null);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/admin/marketplace" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Marketplace Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileSignature className="h-6 w-6 text-green-primary" /> Placement Provider Agreements
        </h1>
        <p className="text-sm text-gray-500 mt-1">Countersign, decline, or request corrections. Executed agreements are stored in the private user-agreements bucket and emailed to the provider.</p>
      </div>

      {message && <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 mt-0.5" />{message}</div>}
      {error && <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 mt-0.5" />{error}</div>}

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${statusFilter === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No agreements match the current filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium">Provider</th>
                  <th className="text-left py-2 px-2 font-medium">Version</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                  <th className="text-left py-2 px-2 font-medium">Signed</th>
                  <th className="text-left py-2 px-2 font-medium">Countersigned</th>
                  <th className="text-right py-2 px-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const stStyle = STATUS_STYLES[r.status] || "bg-gray-100 text-gray-500 border-gray-200";
                  return (
                    <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2 px-2 text-xs">
                        <p className="font-medium text-gray-900">{r.user?.full_name || r.user?.email || r.user_id.slice(0, 8)}</p>
                        <p className="text-gray-400">{r.user?.company_name || ""}{r.user?.company_name && r.user?.email ? " · " : ""}{r.user?.email}</p>
                      </td>
                      <td className="py-2 px-2 text-xs">v{r.agreement_version}</td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${stStyle}`}>
                          {r.status.replace(/_/g, " ")}
                        </span>
                        {r.decline_reason && <p className="text-[10px] text-red-500 mt-0.5 italic">{r.decline_reason}</p>}
                        {r.correction_request_reason && <p className="text-[10px] text-orange-600 mt-0.5 italic">{r.correction_request_reason}</p>}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500">
                        {r.provider_signed_at ? (
                          <>
                            <p>{new Date(r.provider_signed_at).toLocaleDateString()}</p>
                            {r.provider_typed_name && <p className="text-gray-400">{r.provider_typed_name}</p>}
                          </>
                        ) : "—"}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500">
                        {r.countersigned_at ? (
                          <>
                            <p>{new Date(r.countersigned_at).toLocaleDateString()}</p>
                            {r.countersigner_name_snapshot && <p className="text-gray-400">{r.countersigner_name_snapshot}</p>}
                          </>
                        ) : "—"}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        {r.status === "provider_signed_pending_company_countersign" && (
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => countersign(r)}
                              disabled={saving === `countersign-${r.id}`}
                              className="inline-flex items-center gap-1 rounded-md bg-green-primary hover:bg-green-hover px-2 py-0.5 text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
                            >
                              {saving === `countersign-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Countersign
                            </button>
                            <button
                              onClick={() => declineOrCorrect(r, "request_correction")}
                              disabled={saving === `request_correction-${r.id}`}
                              className="inline-flex items-center gap-1 rounded-md border border-orange-200 hover:bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 cursor-pointer disabled:opacity-50"
                            >
                              <Undo2 className="h-3 w-3" /> Correct
                            </button>
                            <button
                              onClick={() => declineOrCorrect(r, "decline")}
                              disabled={saving === `decline-${r.id}`}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 hover:bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="h-3 w-3" /> Decline
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
