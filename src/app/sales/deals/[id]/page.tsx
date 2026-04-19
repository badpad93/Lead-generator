"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Loader2, Plus, Trash2, Send, X, Lock, DollarSign } from "lucide-react";
import type { SalesDeal, DealService, SalesCommission } from "@/lib/salesTypes";
import { DEAL_STAGES, SERVICE_OPTIONS } from "@/lib/salesTypes";

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deal, setDeal] = useState<SalesDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [showAddService, setShowAddService] = useState(false);
  const [newService, setNewService] = useState({ service_name: SERVICE_OPTIONS[0] as string, price: "" });
  const [showFinalize, setShowFinalize] = useState(false);
  const [finalizeForm, setFinalizeForm] = useState({ recipient_email: "james@apexaivending.com", notes: "" });
  const [sending, setSending] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [commissions, setCommissions] = useState<SalesCommission[]>([]);

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) setToken(session.access_token);
    }
    init();
  }, []);

  const fetchDeal = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    const res = await fetch(`/api/sales/deals/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setDeal(await res.json());
    setLoading(false);
  }, [token, id]);

  const fetchCommissions = useCallback(async () => {
    if (!token || !id) return;
    const res = await fetch(`/api/sales/commissions`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const all: SalesCommission[] = await res.json();
      setCommissions(all.filter((c) => c.deal_id === id));
    }
  }, [token, id]);

  useEffect(() => { fetchDeal(); fetchCommissions(); }, [fetchDeal, fetchCommissions]);

  const isLocked = !!deal?.locked_at;

  async function handleStageChange(stage: string) {
    setStageError(null);
    const res = await fetch(`/api/sales/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.validation_errors) {
        setStageError(err.validation_errors.join(". "));
      } else {
        setStageError(err.error || "Failed to change stage");
      }
      return;
    }
    fetchDeal();
    fetchCommissions();
  }

  async function handleAddService() {
    if (!newService.service_name || !newService.price) return;
    await fetch(`/api/sales/deals/${id}/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ service_name: newService.service_name, price: Number(newService.price) }),
    });
    setNewService({ service_name: SERVICE_OPTIONS[0], price: "" });
    setShowAddService(false);
    fetchDeal();
  }

  async function handleDeleteService(serviceId: string) {
    await fetch(`/api/sales/deals/${id}/services/${serviceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchDeal();
  }

  async function handleServiceStatusChange(service: DealService, status: string) {
    await fetch(`/api/sales/deals/${id}/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    fetchDeal();
  }

  async function handleFinalize() {
    setSending(true);
    const createRes = await fetch(`/api/sales/deals/${id}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(finalizeForm),
    });

    if (!createRes.ok) {
      alert("Failed to create order");
      setSending(false);
      return;
    }

    const { orderId } = await createRes.json();

    const sendRes = await fetch(`/api/sales/orders/${orderId}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await sendRes.json().catch(() => ({}));
    if (result.emailSent) {
      const ccInfo = result.cc?.length ? `\nCC: ${result.cc.join(", ")}` : "";
      alert(`Order sent to ${result.recipient}${ccInfo}`);
      setShowFinalize(false);
      fetchDeal();
    } else {
      alert(
        `Order was created but the email did NOT go out.\n\n` +
        `Recipient: ${result.recipient || finalizeForm.recipient_email}\n` +
        `From: ${result.from || "(not set)"}\n` +
        `Reason: ${result.emailError || "Unknown error"}\n\n` +
        `Check that RESEND_API_KEY and FROM_EMAIL are set on the server, ` +
        `and that the FROM_EMAIL domain is verified in your Resend account.`
      );
    }
    setSending(false);
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;
  }

  if (!deal) {
    return <div className="p-6 text-center text-gray-400">Deal not found</div>;
  }

  const services = deal.deal_services || [];
  const totalValue = services.reduce((s, svc) => s + Number(svc.price), 0);

  const commissionStatusColor: Record<string, string> = {
    pending: "bg-yellow-50 text-yellow-700 ring-yellow-200",
    approved: "bg-blue-50 text-blue-700 ring-blue-200",
    paid: "bg-green-50 text-green-700 ring-green-200",
  };

  return (
    <div className="p-6 max-w-4xl">
      <button onClick={() => router.push("/sales/deals")} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to Deals
      </button>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{deal.business_name}</h1>
              {isLocked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                  <Lock className="h-3 w-3" /> Locked
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">Assigned to: {deal.assigned_profile?.full_name || "Unassigned"}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-600">${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-gray-400 mt-1">Deal Value</p>
          </div>
        </div>

        {/* Stage */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
          <select
            value={deal.stage}
            onChange={(e) => handleStageChange(e.target.value)}
            disabled={isLocked}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {DEAL_STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {isLocked && (
            <p className="mt-1 text-xs text-amber-600">This deal is locked. Only admins can modify won or lost deals.</p>
          )}
          {stageError && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm text-red-700">{stageError}</p>
            </div>
          )}
        </div>

        {/* Services */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Services</h2>
            {!isLocked && (
              <button
                onClick={() => setShowAddService(!showAddService)}
                className="inline-flex items-center gap-1 text-sm text-green-600 hover:text-green-700 cursor-pointer"
              >
                <Plus className="h-4 w-4" /> Add Service
              </button>
            )}
          </div>

          {showAddService && (
            <div className="mb-3 flex items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Service</label>
                <select
                  value={newService.service_name}
                  onChange={(e) => setNewService((f) => ({ ...f, service_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm cursor-pointer"
                >
                  {SERVICE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label className="block text-xs text-gray-500 mb-1">Price ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newService.price}
                  onChange={(e) => setNewService((f) => ({ ...f, price: e.target.value }))}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <button onClick={handleAddService} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">Add</button>
              <button onClick={() => setShowAddService(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {services.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400 rounded-lg border border-dashed border-gray-200">No services added yet</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/50">
                  <tr>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Service</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500 text-right">Price</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {services.map((svc) => (
                    <tr key={svc.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-900">{svc.service_name}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900">${Number(svc.price).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-2.5">
                        <select
                          value={svc.status}
                          onChange={(e) => handleServiceStatusChange(svc, e.target.value)}
                          disabled={isLocked}
                          className="rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer disabled:opacity-50"
                        >
                          <option value="pending">Pending</option>
                          <option value="sold">Sold</option>
                          <option value="fulfilled">Fulfilled</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        {!isLocked && (
                          <button
                            onClick={() => handleDeleteService(svc.id)}
                            className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50/50">
                    <td className="px-4 py-2.5 font-semibold text-gray-900">Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-green-600">${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Commission Info */}
        {commissions.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-green-600" /> Commission
            </h2>
            <div className="space-y-2">
              {commissions.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      ${Number(c.commission_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(Number(c.commission_rate) * 100).toFixed(0)}% of ${Number(c.deal_value).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset capitalize ${commissionStatusColor[c.status] || ""}`}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Finalize button */}
        {services.length > 0 && !isLocked && (
          <button
            onClick={() => setShowFinalize(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors cursor-pointer"
          >
            <Send className="h-4 w-4" />
            Finalize & Send Order
          </button>
        )}
      </div>

      {/* Finalize modal */}
      {showFinalize && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Finalize & Send Order</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Email</label>
                <input
                  type="email"
                  value={finalizeForm.recipient_email}
                  onChange={(e) => setFinalizeForm((f) => ({ ...f, recipient_email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={finalizeForm.notes}
                  onChange={(e) => setFinalizeForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{services.length}</span> services totaling{" "}
                  <span className="font-bold text-green-600">${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowFinalize(false)}
                disabled={sending}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalize}
                disabled={sending}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : <><Send className="h-4 w-4" /> Send Order</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
