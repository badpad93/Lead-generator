"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Loader2, FileText, Upload, Trash2, X } from "lucide-react";
import type { SalesAccount, SalesDeal, SalesOrder, SalesDocument, SalesLead } from "@/lib/salesTypes";

interface AccountDetail extends SalesAccount {
  leads: SalesLead[];
  deals: SalesDeal[];
  orders: SalesOrder[];
  documents: SalesDocument[];
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
                {doc.file_name || doc.type}
                <span className="ml-auto text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</span>
              </a>
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
