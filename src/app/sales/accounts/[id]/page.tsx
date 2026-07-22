"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Loader2, FileText, Upload, Trash2, X, Package, Plus, PencilLine } from "lucide-react";
import type { SalesAccount, SalesDeal, SalesOrder, SalesDocument, SalesLead } from "@/lib/salesTypes";

interface Equipment {
  id: string;
  account_id: string;
  name: string;
  serial_number: string | null;
  model: string | null;
  notes: string | null;
  status: "active" | "removed";
  assigned_at: string;
  removed_at: string | null;
  removed_reason: string | null;
  created_at: string;
}

interface AccountDetail extends SalesAccount {
  leads: SalesLead[];
  deals: SalesDeal[];
  orders: SalesOrder[];
  documents: SalesDocument[];
  equipment: Equipment[];
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Equipment add form state
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [equipmentForm, setEquipmentForm] = useState({ name: "", serial_number: "", model: "", assigned_at: "", notes: "" });
  const [equipmentSaving, setEquipmentSaving] = useState(false);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) setToken(session.access_token);
    }
    init();
  }, []);

  const fetchAccount = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    const res = await fetch(`/api/sales/accounts/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setAccount(await res.json());
    setLoading(false);
  }, [token, id]);

  useEffect(() => { fetchAccount(); }, [fetchAccount]);

  async function saveEquipment() {
    if (!token || !id) return;
    setEquipmentError(null);
    if (!equipmentForm.name.trim()) { setEquipmentError("Equipment name is required."); return; }
    setEquipmentSaving(true);
    const res = await fetch(`/api/sales/accounts/${id}/equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: equipmentForm.name.trim(),
        serial_number: equipmentForm.serial_number.trim() || null,
        model: equipmentForm.model.trim() || null,
        notes: equipmentForm.notes.trim() || null,
        assigned_at: equipmentForm.assigned_at || undefined,
      }),
    });
    setEquipmentSaving(false);
    if (!res.ok) {
      setEquipmentError((await res.json().catch(() => ({}))).error || "Failed to add equipment");
      return;
    }
    setEquipmentForm({ name: "", serial_number: "", model: "", assigned_at: "", notes: "" });
    setShowAddEquipment(false);
    fetchAccount();
  }

  async function markEquipmentRemoved(equipmentId: string) {
    const reason = prompt("Reason for removal? (optional)") ?? "";
    const res = await fetch(`/api/sales/accounts/${id}/equipment/${equipmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "removed", removed_reason: reason.trim() || null }),
    });
    if (res.ok) fetchAccount();
  }

  async function reactivateEquipment(equipmentId: string) {
    const res = await fetch(`/api/sales/accounts/${id}/equipment/${equipmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "active" }),
    });
    if (res.ok) fetchAccount();
  }

  async function deleteEquipment(equipmentId: string) {
    if (!confirm("Permanently delete this equipment record? Use Remove instead to preserve history.")) return;
    const res = await fetch(`/api/sales/accounts/${id}/equipment/${equipmentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) fetchAccount();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploading(true);
    setUploadError(null);

    try {
      const supabase = (await import("@/lib/supabase")).createBrowserClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `accounts/${id}/${Date.now()}-${safeName}`;
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(filePath, file, { upsert: false, contentType: file.type || undefined });

      if (uploadErr) {
        setUploadError(`Upload failed: ${uploadErr.message}`);
        return;
      }

      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(filePath);
      const res = await fetch("/api/sales/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          account_id: id,
          file_url: urlData.publicUrl,
          file_name: file.name,
          type: "contract",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUploadError(`Saved file but could not record document: ${err.error || res.statusText}`);
      }
    } finally {
      setUploading(false);
      e.target.value = "";
      fetchAccount();
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this account? Linked leads, deals, and orders will be unlinked.")) return;
    const res = await fetch(`/api/sales/accounts/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to delete");
      return;
    }
    router.push("/sales/accounts");
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;
  }

  if (!account) {
    return <div className="p-6 text-center text-gray-400">Account not found</div>;
  }

  return (
    <div className="p-6 max-w-4xl">
      <button onClick={() => router.push("/sales/accounts")} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to Accounts
      </button>

      {/* Account Info */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">{account.business_name}</h1>
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Account
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Contact:</span> <span className="ml-2 text-gray-900">{account.contact_name || "—"}</span></div>
          <div><span className="text-gray-500">Phone:</span> <span className="ml-2 text-gray-900">{account.phone || "—"}</span></div>
          <div><span className="text-gray-500">Email:</span> <span className="ml-2 text-gray-900">{account.email || "—"}</span></div>
          <div><span className="text-gray-500">Address:</span> <span className="ml-2 text-gray-900">{account.address || "—"}</span></div>
        </div>
      </div>

      {/* Leads */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Leads ({account.leads.length})</h2>
        {account.leads.length === 0 ? (
          <p className="text-sm text-gray-400">No leads linked to this account</p>
        ) : (
          <div className="space-y-2">
            {account.leads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{lead.business_name}</p>
                  <p className="text-xs text-gray-500">
                    {lead.contact_name || "—"} · {lead.phone || "—"}
                  </p>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 capitalize">{lead.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Services from deals */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Services</h2>
        {account.deals.length === 0 ? (
          <p className="text-sm text-gray-400">No deals linked</p>
        ) : (
          <div className="space-y-2">
            {account.deals.flatMap((d) => (d.deal_services || []).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2">
                <span className="text-sm text-gray-900">{s.service_name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 capitalize">{s.status}</span>
                  <span className="text-sm font-medium text-green-600">${Number(s.price).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )))}
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
          <label className="inline-flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 cursor-pointer">
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading..." : "Upload"}
            <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
        {uploadError && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="ml-3 text-red-400 hover:text-red-600 cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
        )}
        {account.documents.length === 0 ? (
          <p className="text-sm text-gray-400">No documents yet</p>
        ) : (
          <div className="space-y-2">
            {account.documents.map((doc) => (
              <a
                key={doc.id}
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
              >
                <FileText className="h-4 w-4" />
                <span className="flex-1 truncate">{doc.file_name || doc.type}</span>
                {(doc.type === "quote_pdf" || doc.type === "order_pdf") && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    doc.type === "quote_pdf" ? "bg-indigo-50 text-indigo-600" : "bg-green-50 text-green-600"
                  }`}>
                    {doc.type === "quote_pdf" ? "Quote" : "Order"}
                  </span>
                )}
                <span className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Equipment */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-400" /> Equipment ({(account.equipment || []).filter((e) => e.status === "active").length} active)
          </h2>
          {!showAddEquipment && (
            <button
              type="button"
              onClick={() => setShowAddEquipment(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Assign Equipment
            </button>
          )}
        </div>

        {showAddEquipment && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={equipmentForm.name}
                onChange={(e) => setEquipmentForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Equipment name *"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              />
              <input
                type="text"
                value={equipmentForm.serial_number}
                onChange={(e) => setEquipmentForm((f) => ({ ...f, serial_number: e.target.value }))}
                placeholder="Serial number"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              />
              <input
                type="text"
                value={equipmentForm.model}
                onChange={(e) => setEquipmentForm((f) => ({ ...f, model: e.target.value }))}
                placeholder="Model (optional)"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              />
              <input
                type="date"
                value={equipmentForm.assigned_at}
                onChange={(e) => setEquipmentForm((f) => ({ ...f, assigned_at: e.target.value }))}
                placeholder="Date assigned"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              />
            </div>
            <textarea
              value={equipmentForm.notes}
              onChange={(e) => setEquipmentForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            />
            {equipmentError && <p className="text-xs text-red-600">{equipmentError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveEquipment}
                disabled={equipmentSaving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {equipmentSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Save
              </button>
              <button
                type="button"
                onClick={() => { setShowAddEquipment(false); setEquipmentError(null); }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {(account.equipment || []).length === 0 ? (
          <p className="text-sm text-gray-400">No equipment assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {(account.equipment || []).map((e) => (
              <div key={e.id} className={`rounded-lg border ${e.status === "removed" ? "border-gray-100 bg-gray-50 opacity-70" : "border-gray-100 bg-white"} p-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {e.name}
                      {e.model && <span className="text-xs text-gray-500 font-normal ml-1">· {e.model}</span>}
                    </p>
                    <div className="mt-0.5 text-[11px] text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {e.serial_number && <span>SN: {e.serial_number}</span>}
                      <span>Assigned: {new Date(e.assigned_at).toLocaleDateString()}</span>
                      {e.status === "removed" && e.removed_at && (
                        <span className="text-red-600">Removed: {new Date(e.removed_at).toLocaleDateString()}</span>
                      )}
                    </div>
                    {e.notes && <p className="mt-1 text-[11px] text-gray-500 whitespace-pre-wrap">{e.notes}</p>}
                    {e.removed_reason && <p className="mt-1 text-[11px] italic text-gray-500">Reason: {e.removed_reason}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${e.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}`}>
                      {e.status}
                    </span>
                    {e.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => markEquipmentRemoved(e.id)}
                        title="Mark as removed"
                        className="rounded-lg p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => reactivateEquipment(e.id)}
                        title="Re-activate"
                        className="rounded-lg p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteEquipment(e.id)}
                      title="Delete permanently"
                      className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orders */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Orders ({account.orders.length})</h2>
        {account.orders.length === 0 ? (
          <p className="text-sm text-gray-400">No orders for this account</p>
        ) : (
          <div className="space-y-2">
            {account.orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2">
                <div>
                  <p className="text-sm text-gray-900">Order #{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 capitalize">{order.status}</span>
                  <span className="text-sm font-medium text-gray-900">${Number(order.total_value).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deal History */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Deal History</h2>
        {account.deals.length === 0 ? (
          <p className="text-sm text-gray-400">No deals</p>
        ) : (
          <div className="space-y-2">
            {account.deals.map((deal) => (
              <div
                key={deal.id}
                onClick={() => router.push(`/sales/deals/${deal.id}`)}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2 cursor-pointer hover:bg-gray-100"
              >
                <span className="text-sm text-gray-900">{deal.business_name}</span>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 capitalize">{deal.stage}</span>
                  <span className="text-sm font-medium text-gray-900">${Number(deal.value).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
