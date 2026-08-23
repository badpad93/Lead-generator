"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Loader2,
  ArrowLeft,
  AlertCircle,
  Check,
  X,
  Pause,
  Play,
  Ban,
  Download,
  CheckCircle2,
  Clock,
  Factory,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Detail {
  partner: Record<string, unknown>;
  equipment: EquipmentSummary[];
  agreements: AgreementSummary[];
  pending_exceptions: ExceptionSummary[];
  all_exceptions: ExceptionSummary[];
  orders: OrderSummary[];
  viewer_role: string;
}

interface EquipmentSummary {
  id: string;
  title: string | null;
  sku: string | null;
  machine_make: string | null;
  machine_model: string | null;
  status: string;
  wholesale_price_cents: number | null;
  buy_now_price: number | null;
}

interface AgreementSummary {
  id: string;
  agreement_version: string;
  effective_date: string;
  signer_printed_name: string;
  signer_title: string;
  accepted_at: string;
  superseded_at: string | null;
}

interface ExceptionSummary {
  id: string;
  machine_listing_id: string;
  status: string;
  requested_wholesale_price_cents: number;
  requested_final_price_cents: number;
  requested_margin_cents: number;
  request_reason: string | null;
  approved_max_margin_cents: number | null;
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
}

interface OrderSummary {
  id: string;
  amount_cents: number | null;
  manufacturer_proceeds_cents: number | null;
  vc_margin_cents: number | null;
  created_at: string;
  status: string | null;
}

export default function AdminManufacturerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers = new Headers(init.headers);
    if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
    return fetch(url, { ...init, headers });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authFetch(`/api/admin/manufacturers/${id}`);
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `Failed (HTTP ${res.status})`);
      else setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setLoading(false);
  }, [authFetch, id]);

  useEffect(() => { void load(); }, [load]);

  async function partnerAction(action: string) {
    const requiresReason = ["reject", "request_changes", "suspend", "terminate"].includes(action);
    let reason = "";
    if (requiresReason) {
      const r = window.prompt(`Reason for ${action.replaceAll("_", " ")} (required):`, "");
      if (r === null) return;
      reason = r.trim();
      if (!reason) return;
    }
    setBusy(action);
    setMessage(null);
    try {
      const res = await authFetch(`/api/admin/manufacturers/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `Failed (HTTP ${res.status})`);
      else {
        setMessage(`Status set to ${data.status.replaceAll("_", " ")}.`);
        void load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusy(null);
  }

  async function equipmentAction(eqId: string, action: string) {
    const requiresReason = ["reject", "request_changes"].includes(action);
    let reason = "";
    if (requiresReason) {
      const r = window.prompt(`Reason for ${action.replaceAll("_", " ")} on this listing (required):`, "");
      if (r === null) return;
      reason = r.trim();
      if (!reason) return;
    }
    setBusy(`eq-${eqId}-${action}`);
    try {
      const res = await authFetch(`/api/admin/manufacturers/equipment/${eqId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `Failed (HTTP ${res.status})`);
      else void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusy(null);
  }

  async function exceptionAction(excId: string, action: "approve" | "reject") {
    let reviewNote = "";
    if (action === "reject") {
      const r = window.prompt("Reason for rejecting this pricing exception (required):", "");
      if (r === null) return;
      reviewNote = r.trim();
      if (!reviewNote) return;
    }
    setBusy(`exc-${excId}-${action}`);
    try {
      const res = await authFetch(`/api/admin/manufacturers/pricing-exceptions/${excId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, review_note: reviewNote }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `Failed (HTTP ${res.status})`);
      else void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusy(null);
  }

  async function downloadAgreement() {
    setBusy("download");
    try {
      const res = await authFetch(`/api/admin/manufacturers/${id}/agreement-download`);
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `Failed (HTTP ${res.status})`);
      else window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusy(null);
  }

  if (loading) return (
    <div className="p-6 max-w-6xl mx-auto flex items-center gap-2 text-sm text-gray-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading manufacturer…
    </div>
  );

  if (error && !detail) return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
    </div>
  );

  if (!detail) return null;
  const p = detail.partner as Record<string, string | number | boolean | null>;
  const status = String(p.status ?? "");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <Link href="/admin/marketplace/manufacturers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-700">
        <ArrowLeft className="h-4 w-4" /> Back to manufacturers
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900">{p.legal_company_name}</h1>
          </div>
          {p.dba_or_brand && <p className="text-sm text-gray-500 mt-0.5">dba {p.dba_or_brand}</p>}
        </div>
        <StatusPill status={status} />
      </div>

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {(status === "submitted" || status === "pending_review" || status === "changes_requested") && (
          <>
            <ActionButton onClick={() => partnerAction("approve")} disabled={!!busy} label="Approve" icon={Check} tone="green" />
            <ActionButton onClick={() => partnerAction("request_changes")} disabled={!!busy} label="Request Changes" icon={Clock} tone="orange" />
            <ActionButton onClick={() => partnerAction("reject")} disabled={!!busy} label="Reject" icon={X} tone="red" />
          </>
        )}
        {(status === "approved" || status === "active") && (
          <>
            <ActionButton onClick={() => partnerAction("suspend")} disabled={!!busy} label="Suspend" icon={Pause} tone="orange" />
            <ActionButton onClick={() => partnerAction("terminate")} disabled={!!busy} label="Terminate" icon={Ban} tone="red" />
          </>
        )}
        {status === "suspended" && (
          <>
            <ActionButton onClick={() => partnerAction("reactivate")} disabled={!!busy} label="Reactivate" icon={Play} tone="green" />
            <ActionButton onClick={() => partnerAction("terminate")} disabled={!!busy} label="Terminate" icon={Ban} tone="red" />
          </>
        )}
        {detail.agreements.length > 0 && (
          <ActionButton onClick={downloadAgreement} disabled={!!busy} label="Download Agreement" icon={Download} tone="neutral" />
        )}
      </div>

      {/* Two-col metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Contact">
          <KV k="Primary contact" v={String(p.primary_contact_name ?? "—")} />
          <KV k="Title" v={String(p.primary_contact_title ?? "—")} />
          <KV k="Email" v={String(p.primary_contact_email ?? "—")} />
          <KV k="Phone" v={String(p.primary_contact_phone ?? "—")} />
          <KV k="Type" v={String(p.entity_type ?? "—")} />
          <KV k="Website" v={String(p.website ?? "—")} />
          <KV k="EIN / Tax ID" v={String(p.ein_tax_id ?? "—")} />
        </Card>
        <Card title="Address & Fulfillment">
          <KV k="Business address" v={[p.business_address, p.business_city, p.business_state, p.business_zip].filter(Boolean).join(", ") || "—"} />
          <KV k="Shipping origin" v={[p.shipping_origin_address, p.shipping_origin_city, p.shipping_origin_state, p.shipping_origin_zip].filter(Boolean).join(", ") || "—"} />
          <KV k="Order ack time" v={p.order_acknowledgment_time_hours != null ? `${p.order_acknowledgment_time_hours} hrs` : "—"} />
          <KV k="Shipment lead time" v={p.shipment_lead_time_days != null ? `${p.shipment_lead_time_days} days` : "—"} />
          <KV k="Payout status" v={String(p.payout_status ?? "—")} />
          <KV k="Bank verified" v={p.dwolla_verified_at ? new Date(String(p.dwolla_verified_at)).toLocaleString() : "Not yet"} />
        </Card>
      </div>

      {p.status_reason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Current status reason:</span> {String(p.status_reason)}
        </div>
      )}

      {/* Agreements */}
      <Card title="Agreements">
        {detail.agreements.length === 0 && <p className="text-sm text-gray-500">No agreement signed yet.</p>}
        <div className="space-y-2">
          {detail.agreements.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-gray-900">v{a.agreement_version}</span>
                {a.superseded_at && <span className="ml-2 text-xs text-gray-400">(superseded {new Date(a.superseded_at).toLocaleDateString()})</span>}
                <div className="text-xs text-gray-500">
                  Signed by {a.signer_printed_name} · {a.signer_title} · {new Date(a.accepted_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Pending pricing exceptions */}
      {detail.pending_exceptions.length > 0 && (
        <Card title={`Pending pricing exceptions (${detail.pending_exceptions.length})`}>
          <div className="space-y-3">
            {detail.pending_exceptions.map((e) => (
              <div key={e.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm text-gray-900">
                  Requesting margin{" "}
                  <span className="font-semibold">${(e.requested_margin_cents / 100).toFixed(2)}</span>
                  {" on listing "}
                  <Link href={`/machines-for-sale/${e.machine_listing_id}`} className="text-green-700 hover:underline">
                    #{e.machine_listing_id.slice(0, 8)}
                  </Link>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Wholesale ${(e.requested_wholesale_price_cents / 100).toFixed(2)} →
                  Final ${(e.requested_final_price_cents / 100).toFixed(2)}
                </div>
                {e.request_reason && (
                  <div className="text-xs text-gray-700 mt-2 italic">&ldquo;{e.request_reason}&rdquo;</div>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => exceptionAction(e.id, "approve")}
                    disabled={!!busy}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve at ${(e.requested_margin_cents / 100).toFixed(2)}
                  </button>
                  <button
                    type="button"
                    onClick={() => exceptionAction(e.id, "reject")}
                    disabled={!!busy}
                    className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Equipment */}
      <Card title={`Equipment (${detail.equipment.length})`}>
        {detail.equipment.length === 0 && <p className="text-sm text-gray-500">No equipment listed yet.</p>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">SKU</th>
                <th className="px-3 py-2 text-right font-medium">Wholesale</th>
                <th className="px-3 py-2 text-right font-medium">Final</th>
                <th className="px-3 py-2 text-right font-medium">Margin</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {detail.equipment.map((eq) => {
                const wholesaleD = eq.wholesale_price_cents != null ? eq.wholesale_price_cents / 100 : null;
                const finalD = eq.buy_now_price != null ? Number(eq.buy_now_price) : null;
                const marginD = wholesaleD != null && finalD != null ? finalD - wholesaleD : null;
                return (
                  <tr key={eq.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{eq.title || "(untitled)"}</div>
                      <div className="text-xs text-gray-500">{[eq.machine_make, eq.machine_model].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{eq.sku || "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{wholesaleD != null ? `$${wholesaleD.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{finalD != null ? `$${finalD.toFixed(2)}` : "—"}</td>
                    <td className={`px-3 py-2 text-right font-medium ${marginD != null && marginD > 300 ? "text-amber-700" : "text-green-700"}`}>
                      {marginD != null ? `$${marginD.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2"><EquipmentPill status={eq.status} /></td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        {(eq.status === "pending_review" || eq.status === "changes_requested" || eq.status === "draft") && (
                          <>
                            <button
                              type="button"
                              onClick={() => equipmentAction(eq.id, "approve")}
                              disabled={!!busy}
                              className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => equipmentAction(eq.id, "request_changes")}
                              disabled={!!busy}
                              className="rounded px-2 py-1 text-xs text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                            >
                              Request Changes
                            </button>
                            <button
                              type="button"
                              onClick={() => equipmentAction(eq.id, "reject")}
                              disabled={!!busy}
                              className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {eq.status === "active" && (
                          <button
                            type="button"
                            onClick={() => equipmentAction(eq.id, "deactivate")}
                            disabled={!!busy}
                            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Deactivate
                          </button>
                        )}
                        {eq.status === "inactive" && (
                          <button
                            type="button"
                            onClick={() => equipmentAction(eq.id, "activate")}
                            disabled={!!busy}
                            className="rounded px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Orders */}
      <Card title={`Recent orders (${detail.orders.length})`}>
        {detail.orders.length === 0 && <p className="text-sm text-gray-500">No orders yet.</p>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Order</th>
                <th className="px-3 py-2 text-right font-medium">Gross</th>
                <th className="px-3 py-2 text-right font-medium">Mfr proceeds</th>
                <th className="px-3 py-2 text-right font-medium">VC margin</th>
                <th className="px-3 py-2 text-left font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {detail.orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2 text-xs text-gray-600 font-mono">{o.id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {o.amount_cents != null ? `$${(o.amount_cents / 100).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {o.manufacturer_proceeds_cents != null ? `$${(o.manufacturer_proceeds_cents / 100).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {o.vc_margin_cents != null ? `$${(o.vc_margin_cents / 100).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-900 text-right">{v}</span>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  label,
  icon: Icon,
  tone,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "green" | "orange" | "red" | "neutral";
}) {
  const toneClasses: Record<string, string> = {
    green: "bg-green-600 text-white hover:bg-green-700",
    orange: "border border-orange-200 bg-white text-orange-800 hover:bg-orange-50",
    red: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
    neutral: "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${toneClasses[tone]}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    submitted: "bg-blue-50 text-blue-700",
    pending_review: "bg-yellow-50 text-yellow-800",
    changes_requested: "bg-orange-50 text-orange-800",
    approved: "bg-green-50 text-green-700",
    active: "bg-green-100 text-green-800 font-semibold",
    suspended: "bg-red-50 text-red-700",
    rejected: "bg-gray-100 text-gray-500 line-through",
    terminated: "bg-gray-100 text-gray-500 line-through",
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${map[status] ?? map.draft}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function EquipmentPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    pending_review: "bg-yellow-50 text-yellow-800",
    changes_requested: "bg-orange-50 text-orange-800",
    approved: "bg-green-50 text-green-700",
    active: "bg-green-100 text-green-800",
    rejected: "bg-red-50 text-red-700",
    inactive: "bg-gray-100 text-gray-500",
    sold: "bg-blue-50 text-blue-700",
    pending: "bg-yellow-50 text-yellow-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? map.draft}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
