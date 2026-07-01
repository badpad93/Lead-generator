"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import {
  Loader2, ArrowLeft, Plus, Upload, AlertCircle, CheckCircle2,
  Package, MapPin, Coffee, Monitor, Wrench, DollarSign,
  FileText, Clock, User, Building2, Trash2, ScrollText,
} from "lucide-react";

interface OrderItem {
  id: string;
  item_type: string;
  service_name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  total_price: number;
  status: string;
  location_service_price: number | null;
  deposit_required: boolean;
  location_deposit_amount: number | null;
  location_deposit_paid: boolean;
  location_remaining_balance: number | null;
}

interface Activity {
  id: string;
  activity_type: string;
  description: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

interface OrderDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

interface OrderDetail {
  id: string;
  order_number: number;
  order_status: string;
  order_type: string | null;
  document_type: string | null;
  total_value: number;
  deposit_amount: number;
  deposit_paid: boolean;
  remaining_balance: number;
  payment_status: string;
  invoice_status: string;
  agreement_status: string;
  fulfillment_status: string;
  location_remaining_invoice_status?: string;
  location_remaining_invoice_sent_at?: string | null;
  receipt_status?: string;
  receipt_sent_at?: string | null;
  deposit_receipt_status?: string;
  deposit_receipt_sent_at?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  next_required_action: string | null;
  notes: string | null;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
  sales_accounts: { id: string; business_name: string; contact_name: string; email: string; phone: string; address: string } | null;
  assigned_profile: { full_name: string; email: string } | null;
  order_items: OrderItem[];
  activities: Activity[];
  documents: OrderDocument[];
}

const ITEM_TYPES = [
  { value: "machine_sale", label: "Machine Sale", icon: Package },
  { value: "location_services", label: "Location Services", icon: MapPin },
  { value: "coffee_program", label: "Coffee Program", icon: Coffee },
  { value: "vendera_ai_cooler", label: "VendEra AI Cooler", icon: Monitor },
  { value: "combo_machine", label: "Combo Machine", icon: Package },
  { value: "financing", label: "Financing", icon: DollarSign },
  { value: "other", label: "Other Services", icon: Wrench },
];

const STATUS_ACTIONS = [
  { action: "send_invoice", label: "Send Invoice", color: "bg-blue-600 hover:bg-blue-700" },
  { action: "send_agreement", label: "Send Agreement", color: "bg-indigo-600 hover:bg-indigo-700" },
  { action: "mark_agreement_signed", label: "Mark Signed", color: "bg-purple-600 hover:bg-purple-700" },
  { action: "mark_deposit_paid", label: "Mark Deposit Paid", color: "bg-emerald-600 hover:bg-emerald-700" },
  { action: "mark_paid", label: "Mark Paid", color: "bg-green-600 hover:bg-green-700" },
  { action: "mark_machine_ordered", label: "Mark Machine Ordered", color: "bg-violet-600 hover:bg-violet-700" },
  { action: "mark_location_search", label: "Location Search Active", color: "bg-cyan-600 hover:bg-cyan-700" },
  { action: "mark_coffee_setup", label: "Coffee Program Setup", color: "bg-amber-600 hover:bg-amber-700" },
  { action: "mark_shipped", label: "Mark Shipped", color: "bg-sky-600 hover:bg-sky-700" },
  { action: "mark_delivered", label: "Mark Delivered", color: "bg-teal-600 hover:bg-teal-700" },
  { action: "mark_completed", label: "Mark Completed", color: "bg-green-700 hover:bg-green-800" },
  { action: "mark_cancelled", label: "Cancel Order", color: "bg-red-600 hover:bg-red-700" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-50 text-gray-600 ring-gray-200",
  awaiting_customer_info: "bg-yellow-50 text-yellow-700 ring-yellow-200",
  invoice_sent: "bg-blue-50 text-blue-700 ring-blue-200",
  agreement_sent: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  awaiting_signature: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  awaiting_payment: "bg-orange-50 text-orange-700 ring-orange-200",
  deposit_paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  paid: "bg-green-50 text-green-700 ring-green-200",
  machine_ordered: "bg-purple-50 text-purple-700 ring-purple-200",
  location_search_active: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  coffee_program_setup: "bg-amber-50 text-amber-700 ring-amber-200",
  shipped: "bg-sky-50 text-sky-700 ring-sky-200",
  delivered: "bg-teal-50 text-teal-700 ring-teal-200",
  completed: "bg-green-50 text-green-700 ring-green-200",
  cancelled: "bg-red-50 text-red-600 ring-red-200",
};

function formatStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [token, setToken] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [showCustomReceipt, setShowCustomReceipt] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [noteText, setNoteText] = useState("");

  const [agreements, setAgreements] = useState<{ id: string; agreement_status: string; created_at: string; sent_at: string | null; operator_signed_at: string | null; apex_signed_at: string | null }[]>([]);
  const [agreementLoading, setAgreementLoading] = useState(false);

  const [newItem, setNewItem] = useState({
    item_type: "machine_sale",
    item_name: "",
    description: "",
    quantity: "1",
    unit_price: "",
    deposit_required: false,
    location_deposit_amount: "100",
    location_service_price: "",
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, []);

  const fetchOrder = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch(`/api/sales/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setOrder(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        setFetchError(err.error || `Failed to load (status ${res.status})`);
        console.error("[orders/[id]] Failed to load:", res.status, err);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFetchError(msg);
      console.error("[orders/[id]] Fetch error:", e);
    }
    setLoading(false);
  }, [token, id]);

  const fetchAgreements = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/sales/orders/${id}/agreement`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setAgreements(await res.json());
  }, [token, id]);

  useEffect(() => { fetchOrder(); fetchAgreements(); }, [fetchOrder, fetchAgreements]);

  async function handleStatusAction(action: string) {
    setActionLoading(action);
    await fetch(`/api/sales/orders/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
    await fetchOrder();
    setActionLoading("");
  }

  async function handleSendRemainingBalance() {
    if (!confirm("Send the Location Services remaining balance invoice to the customer? This typically goes out once secured locations have been fulfilled.")) return;
    setActionLoading("send_remaining_balance");
    const res = await fetch(`/api/sales/orders/${id}/send-remaining-balance`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) alert(data.error || "Failed to send remaining balance invoice");
    await fetchOrder();
    setActionLoading("");
  }

  async function handleSendReceipt(paymentType: "deposit" | "full") {
    const label = paymentType === "deposit" ? "deposit" : "payment";
    const method = prompt(`Payment method (e.g. "Wire Transfer", "ACH", "Credit Card") for this ${label} receipt:`) || "";
    if (method === null) return;
    const reference = prompt(`Reference number for this ${label} receipt (optional):`) || "";
    if (!confirm(`Send the ${label} receipt to the customer?`)) return;

    setActionLoading(paymentType === "deposit" ? "send_deposit_receipt" : "send_receipt");
    const res = await fetch(`/api/sales/orders/${id}/send-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        payment_type: paymentType,
        payment_method: method || null,
        payment_reference: reference || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || "Failed to send receipt");
    }
    await fetchOrder();
    setActionLoading("");
  }

  async function handleAddItem() {
    const res = await fetch(`/api/sales/orders/${id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        item_type: newItem.item_type,
        item_name: newItem.item_name,
        description: newItem.description || null,
        quantity: Number(newItem.quantity) || 1,
        unit_price: Number(newItem.unit_price) || 0,
        deposit_required: newItem.deposit_required,
        location_deposit_amount: newItem.deposit_required ? Number(newItem.location_deposit_amount) || 100 : null,
        location_service_price: newItem.item_type === "location_services" ? Number(newItem.location_service_price) || 0 : null,
      }),
    });
    if (res.ok) {
      setShowAddItem(false);
      setNewItem({ item_type: "machine_sale", item_name: "", description: "", quantity: "1", unit_price: "", deposit_required: false, location_deposit_amount: "100", location_service_price: "" });
      fetchOrder();
    }
  }

  async function handleGenerateAgreement() {
    setAgreementLoading(true);
    const res = await fetch(`/api/sales/orders/${id}/agreement`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const agreement = await res.json();
      router.push(`/sales/orders/${id}/agreement?aid=${agreement.id}`);
    }
    setAgreementLoading(false);
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm("Remove this item?")) return;
    await fetch(`/api/sales/orders/${id}/items/${itemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchOrder();
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    await fetch(`/api/sales/orders/${id}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ activity_type: "note", description: noteText.trim() }),
    });
    setNoteText("");
    fetchOrder();
  }

  async function handleUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_type", "general");
    await fetch(`/api/sales/orders/${id}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    fetchOrder();
    e.target.value = "";
  }

  async function handleNextAction(value: string) {
    await fetch(`/api/sales/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ next_required_action: value }),
    });
    fetchOrder();
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-green-600" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <button onClick={() => router.push("/sales/orders")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-600 mb-4 cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Back to Orders
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-700 mb-2">Failed to load order</p>
          <p className="text-xs text-red-600">{fetchError || "The order could not be found or you don't have access."}</p>
          <button
            onClick={() => fetchOrder()}
            className="mt-4 inline-flex items-center gap-1 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl">
      <button onClick={() => router.push("/sales/orders")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-600 mb-4 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to Orders
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {order.document_type === "quote" ? "Quote" : "Order"} #{order.order_number || order.id.slice(0, 6).toUpperCase()}
            </h1>
            {order.document_type === "quote" && (
              <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600 ring-1 ring-indigo-200">QUOTE</span>
            )}
            <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_COLORS[order.order_status] || STATUS_COLORS.draft}`}>
              {formatStatus(order.order_status || "draft")}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Created {new Date(order.created_at).toLocaleDateString()} · Updated {new Date(order.updated_at || order.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Next Required Action */}
      {order.next_required_action && order.order_status !== "completed" && order.order_status !== "cancelled" && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-600 uppercase">Next Required Action</p>
            <p className="text-sm font-semibold text-amber-800">{order.next_required_action}</p>
          </div>
          <button
            onClick={() => {
              const val = prompt("Update next action:", order.next_required_action || "");
              if (val !== null) handleNextAction(val);
            }}
            className="text-xs text-amber-600 hover:text-amber-800 underline cursor-pointer"
          >
            Edit
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-gray-400" /> Customer
            </h3>
            {order.sales_accounts ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-400 text-xs">Business</span>
                  <p className="font-medium text-gray-900">{order.sales_accounts.business_name}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Contact</span>
                  <p className="text-gray-700">{order.sales_accounts.contact_name || "—"}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Email</span>
                  <p className="text-gray-700">{order.sales_accounts.email || "—"}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Phone</span>
                  <p className="text-gray-700">{order.sales_accounts.phone || "—"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No account linked</p>
            )}
          </div>

          {/* Order Items */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400" /> Order Items
              </h3>
              <button
                onClick={() => setShowAddItem(true)}
                className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>

            {order.order_items.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No items yet.</p>
            ) : (
              <div className="space-y-2">
                {order.order_items.map((item) => {
                  const ItemIcon = ITEM_TYPES.find((t) => t.value === item.item_type)?.icon || Wrench;
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 hover:bg-gray-50">
                      <ItemIcon className="h-4 w-4 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.service_name}</p>
                        <p className="text-xs text-gray-400">
                          {formatStatus(item.item_type)} · Qty: {item.quantity}
                          {Number(item.discount_percent) > 0 && (
                            <span className="ml-2 text-green-600 font-medium">{item.discount_percent}% off</span>
                          )}
                          {item.deposit_required && item.location_deposit_amount != null && (
                            <span className="ml-2 text-amber-600">
                              Deposit: ${Number(item.location_deposit_amount).toFixed(2)}
                              {item.location_deposit_paid ? " (Paid)" : " (Pending)"}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        ${Number(item.total_price || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                      <button onClick={() => handleDeleteItem(item.id)} className="p-1 text-gray-300 hover:text-red-500 cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add item form */}
            {showAddItem && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50/50 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={newItem.item_type}
                    onChange={(e) => setNewItem((f) => ({ ...f, item_type: e.target.value }))}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    {ITEM_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Item name"
                    value={newItem.item_name}
                    onChange={(e) => setNewItem((f) => ({ ...f, item_name: e.target.value }))}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Quantity"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem((f) => ({ ...f, quantity: e.target.value }))}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Unit price"
                    value={newItem.unit_price}
                    onChange={(e) => setNewItem((f) => ({ ...f, unit_price: e.target.value }))}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  {newItem.item_type === "location_services" && (
                    <>
                      <input
                        type="number"
                        placeholder="Location service total price"
                        value={newItem.location_service_price}
                        onChange={(e) => setNewItem((f) => ({ ...f, location_service_price: e.target.value }))}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newItem.deposit_required}
                          onChange={(e) => setNewItem((f) => ({ ...f, deposit_required: e.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300 text-green-600"
                        />
                        <label className="text-xs text-gray-600">$100 deposit required</label>
                      </div>
                    </>
                  )}
                </div>
                <textarea
                  placeholder="Description (optional)"
                  value={newItem.description}
                  onChange={(e) => setNewItem((f) => ({ ...f, description: e.target.value }))}
                  className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  rows={2}
                />
                <div className="mt-3 flex gap-2">
                  <button onClick={handleAddItem} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">Add</button>
                  <button onClick={() => setShowAddItem(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
                </div>
              </div>
            )}

            {/* Totals */}
            {order.order_items.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Value</span>
                  <span className="font-bold text-gray-900">${Number(order.total_value || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
                {Number(order.deposit_amount) > 0 && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-500">Deposit {order.deposit_paid ? "(Paid)" : "(Pending)"}</span>
                    <span className={order.deposit_paid ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
                      ${Number(order.deposit_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Remaining</span>
                  <span className="font-medium text-gray-700">${Number(order.remaining_balance || order.total_value || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-400" /> Documents
              </h3>
              <label className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium cursor-pointer">
                <Upload className="h-3.5 w-3.5" /> Upload
                <input type="file" className="hidden" onChange={handleUploadDoc} />
              </label>
            </div>
            {order.documents.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No documents uploaded.</p>
            ) : (
              <div className="space-y-2">
                {order.documents.map((doc) => (
                  <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-gray-100 p-2 hover:bg-gray-50 text-sm">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="flex-1 text-gray-700 truncate">{doc.file_name}</span>
                    <span className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Activity Log */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-gray-400" /> Activity
            </h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Add a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
              <button onClick={handleAddNote} disabled={!noteText.trim()} className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-50 cursor-pointer">Add</button>
            </div>
            {order.activities.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No activity yet.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {order.activities.map((a) => (
                  <div key={a.id} className="flex gap-3">
                    <div className="mt-1 h-2 w-2 rounded-full bg-green-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{a.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {a.profiles?.full_name || "System"} · {new Date(a.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Status Summary */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Status</h3>
            <div className="space-y-3">
              <StatusRow label="Payment" value={order.payment_status} />
              <StatusRow label="Invoice" value={order.invoice_status} />
              <StatusRow label="Agreement" value={order.agreement_status} />
              <StatusRow label="Fulfillment" value={order.fulfillment_status} />
            </div>
          </div>

          {/* Assigned Rep */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-gray-400" /> Assigned Rep
            </h3>
            <p className="text-sm text-gray-700">{order.assigned_profile?.full_name || "Unassigned"}</p>
            {order.assigned_profile?.email && (
              <p className="text-xs text-gray-400">{order.assigned_profile.email}</p>
            )}
          </div>

          {/* Purchase Agreement */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-1">
              <ScrollText className="h-4 w-4 text-gray-400" />
              {order.document_type === "quote" ? "Convert to Agreement" : "Purchase Agreement"}
            </h3>
            {order.document_type === "quote" && agreements.length === 0 && (
              <p className="text-xs text-gray-500 mb-3">
                Optional — turn this quote into a purchase agreement using the same items and totals. The quote stays intact.
              </p>
            )}
            {agreements.length === 0 ? (
              <div className="text-center py-3">
                {order.document_type !== "quote" && (
                  <p className="text-xs text-gray-400 mb-3">No agreement generated yet</p>
                )}
                <button
                  onClick={handleGenerateAgreement}
                  disabled={agreementLoading}
                  className="w-full rounded-lg px-3 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {agreementLoading
                    ? "Generating..."
                    : order.document_type === "quote"
                      ? "Convert Quote to Agreement"
                      : "Generate Purchase Agreement"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {agreements.map((ag) => (
                  <div key={ag.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${
                        ag.agreement_status === "signed" ? "bg-green-50 text-green-700 ring-green-200" :
                        ag.agreement_status === "sent" ? "bg-blue-50 text-blue-700 ring-blue-200" :
                        ag.agreement_status === "viewed" ? "bg-indigo-50 text-indigo-700 ring-indigo-200" :
                        ag.agreement_status === "partially_signed" ? "bg-purple-50 text-purple-700 ring-purple-200" :
                        "bg-gray-50 text-gray-600 ring-gray-200"
                      }`}>
                        {ag.agreement_status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                      <span className="text-[10px] text-gray-400">{new Date(ag.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="space-y-1 text-[10px] text-gray-400">
                      {ag.sent_at && <p>Sent: {new Date(ag.sent_at).toLocaleDateString()}</p>}
                      {ag.operator_signed_at && <p>Operator signed: {new Date(ag.operator_signed_at).toLocaleDateString()}</p>}
                      {ag.apex_signed_at && <p>Apex signed: {new Date(ag.apex_signed_at).toLocaleDateString()}</p>}
                    </div>
                    <button
                      onClick={() => router.push(`/sales/orders/${id}/agreement?aid=${ag.id}`)}
                      className="mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      Open Agreement
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleGenerateAgreement}
                  disabled={agreementLoading}
                  className="w-full rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {agreementLoading ? "..." : "+ New Agreement"}
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          {order.order_status !== "completed" && order.order_status !== "cancelled" && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Actions</h3>
              <div className="grid grid-cols-1 gap-2">
                {STATUS_ACTIONS.map((sa) => (
                  <button
                    key={sa.action}
                    onClick={() => handleStatusAction(sa.action)}
                    disabled={actionLoading === sa.action}
                    className={`w-full rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50 ${sa.color}`}
                  >
                    {actionLoading === sa.action ? "..." : sa.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Location Services Remaining Balance */}
          {(() => {
            const pendingBalance = order.order_items.find(
              (i) => i.status === "pending_fulfillment" && i.service_name === "Location Services Remaining Balance"
            );
            if (!pendingBalance) return null;
            const alreadySent = order.location_remaining_invoice_status === "sent" || order.location_remaining_invoice_status === "paid";
            return (
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
                <h3 className="text-sm font-semibold text-purple-900 mb-1">Location Services Balance</h3>
                <p className="text-xs text-purple-700 mb-3">
                  {alreadySent
                    ? `Remaining balance invoice was sent${order.location_remaining_invoice_sent_at ? ` on ${new Date(order.location_remaining_invoice_sent_at).toLocaleDateString()}` : ""}.`
                    : `$${Number(pendingBalance.total_price).toLocaleString("en-US", { minimumFractionDigits: 2 })} pending. Send this invoice after secured locations have been fulfilled.`}
                </p>
                {!alreadySent && (
                  <button
                    onClick={handleSendRemainingBalance}
                    disabled={actionLoading === "send_remaining_balance"}
                    className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading === "send_remaining_balance" ? "Sending..." : "Send Remaining Balance Invoice"}
                  </button>
                )}
              </div>
            );
          })()}

          {/* Customer Receipts */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="text-sm font-semibold text-emerald-900 mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Customer Receipts
            </h3>
            {(order.payment_status === "paid" || order.payment_status === "deposit_paid" || order.receipt_status === "sent" || order.deposit_receipt_status === "sent") && (
              <div className="mb-3">
              <div className="space-y-2">
                {/* Deposit receipt */}
                {(order.payment_status === "deposit_paid" || order.deposit_receipt_status === "sent") && (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="text-emerald-800">
                      <p className="font-medium">Deposit Receipt</p>
                      {order.deposit_receipt_status === "sent" && order.deposit_receipt_sent_at && (
                        <p className="text-emerald-600 text-[10px]">Sent {new Date(order.deposit_receipt_sent_at).toLocaleDateString()}</p>
                      )}
                    </div>
                    {order.deposit_receipt_status !== "sent" ? (
                      <button
                        onClick={() => handleSendReceipt("deposit")}
                        disabled={actionLoading === "send_deposit_receipt"}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                      >
                        {actionLoading === "send_deposit_receipt" ? "Sending..." : "Send Receipt"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSendReceipt("deposit")}
                        disabled={actionLoading === "send_deposit_receipt"}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 cursor-pointer disabled:opacity-50"
                      >
                        Resend
                      </button>
                    )}
                  </div>
                )}
                {/* Full payment receipt */}
                {(order.payment_status === "paid" || order.receipt_status === "sent") && (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="text-emerald-800">
                      <p className="font-medium">Payment Receipt</p>
                      {order.receipt_status === "sent" && order.receipt_sent_at && (
                        <p className="text-emerald-600 text-[10px]">Sent {new Date(order.receipt_sent_at).toLocaleDateString()}</p>
                      )}
                    </div>
                    {order.receipt_status !== "sent" ? (
                      <button
                        onClick={() => handleSendReceipt("full")}
                        disabled={actionLoading === "send_receipt"}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                      >
                        {actionLoading === "send_receipt" ? "Sending..." : "Send Receipt"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSendReceipt("full")}
                        disabled={actionLoading === "send_receipt"}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 cursor-pointer disabled:opacity-50"
                      >
                        Resend
                      </button>
                    )}
                  </div>
                )}
              </div>
              </div>
            )}
            <button
              onClick={() => setShowCustomReceipt(true)}
              className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-emerald-700 border border-emerald-200 bg-white hover:bg-emerald-100 cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" /> Send Custom Receipt
            </button>
            <p className="mt-2 text-[10px] text-emerald-700/70 text-center">
              Custom receipts don&apos;t change the order status — useful for partial payments, adjustments, or one-off invoicing.
            </p>
          </div>

          {(order.order_status === "completed" || order.order_status === "cancelled") && (
            <div className={`rounded-xl p-5 text-center ${order.order_status === "completed" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
              <CheckCircle2 className={`mx-auto h-8 w-8 ${order.order_status === "completed" ? "text-green-600" : "text-red-500"}`} />
              <p className={`mt-2 font-semibold ${order.order_status === "completed" ? "text-green-800" : "text-red-700"}`}>
                {order.order_status === "completed" ? "Order Completed" : "Order Cancelled"}
              </p>
            </div>
          )}
        </div>
      </div>

      {showCustomReceipt && (
        <CustomReceiptModal
          order={order}
          token={token}
          onClose={() => setShowCustomReceipt(false)}
          onSent={() => {
            setShowCustomReceipt(false);
            fetchOrder();
          }}
        />
      )}
    </div>
  );
}

interface CustomReceiptModalProps {
  order: OrderDetail;
  token: string;
  onClose: () => void;
  onSent: () => void;
}

interface CustomLineItem {
  service_name: string;
  description: string;
  quantity: string;
  unit_price: string;
}

function CustomReceiptModal({ order, token, onClose, onSent }: CustomReceiptModalProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stampLabel, setStampLabel] = useState("Payment Received");
  const [amount, setAmount] = useState("");
  const [balanceRemaining, setBalanceRemaining] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [recipientEmail, setRecipientEmail] = useState(order.sales_accounts?.email || "");
  const [ccInput, setCcInput] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");

  const [items, setItems] = useState<CustomLineItem[]>(
    order.order_items.length > 0
      ? order.order_items.map((i) => ({
          service_name: i.service_name || "",
          description: i.description || "",
          quantity: String(i.quantity || 1),
          unit_price: String(i.unit_price || 0),
        }))
      : [{ service_name: "", description: "", quantity: "1", unit_price: "0" }],
  );

  const itemsSubtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const finalAmount = amount ? Number(amount) : itemsSubtotal;

  function addItem() {
    setItems([...items, { service_name: "", description: "", quantity: "1", unit_price: "0" }]);
  }
  function updateItem(idx: number, field: keyof CustomLineItem, value: string) {
    const copy = [...items];
    copy[idx] = { ...copy[idx], [field]: value };
    setItems(copy);
  }
  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  async function handleSend() {
    setError(null);
    if (!recipientEmail.trim()) {
      setError("Recipient email is required");
      return;
    }
    if (finalAmount <= 0) {
      setError("Amount must be greater than $0");
      return;
    }
    if (items.filter((i) => i.service_name.trim()).length === 0) {
      setError("At least one line item is required");
      return;
    }

    setSending(true);
    const body = {
      payment_type: "full", // stamp label overrides display anyway
      payment_method: paymentMethod || null,
      payment_reference: paymentReference || null,
      custom_amount: finalAmount,
      custom_balance_remaining: balanceRemaining !== "" ? Number(balanceRemaining) : undefined,
      custom_items: items
        .filter((i) => i.service_name.trim())
        .map((i) => ({
          service_name: i.service_name,
          description: i.description || null,
          quantity: Number(i.quantity) || 1,
          unit_price: Number(i.unit_price) || 0,
          total_price: (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
        })),
      custom_notes: notes || null,
      custom_stamp_label: stampLabel || null,
      custom_subject: subject || null,
      custom_paid_at: paidAt ? new Date(paidAt).toISOString() : undefined,
      custom_recipient_email: recipientEmail.trim(),
      custom_cc: ccInput
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean),
      reason: reason || null,
    };

    const res = await fetch(`/api/sales/orders/${order.id}/send-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onSent();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to send receipt");
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl my-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Send Custom Receipt</h2>
            <p className="text-xs text-gray-500">Send a one-off receipt with fully custom fields. Does not change the order&apos;s receipt status.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 cursor-pointer">
            <Trash2 className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {/* Recipient */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Recipient Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">CC (comma-separated)</label>
              <input
                type="text"
                value={ccInput}
                onChange={(e) => setCcInput(e.target.value)}
                placeholder="rep@apex.com, ops@apex.com"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Stamp / subject */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Stamp Label</label>
              <input
                type="text"
                value={stampLabel}
                onChange={(e) => setStampLabel(e.target.value)}
                placeholder="PAID IN FULL"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-gray-400">Big green badge at the top of the PDF.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email Subject (optional)</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={`Payment received — Order #${order.order_number}`}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Line Items</label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_70px_100px_32px] gap-2 items-start">
                  <div>
                    <input
                      type="text"
                      value={item.service_name}
                      onChange={(e) => updateItem(idx, "service_name", e.target.value)}
                      placeholder="Line item description"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                    {item.description !== undefined && (
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(idx, "description", e.target.value)}
                        placeholder="Sub-description (optional)"
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 focus:border-emerald-500 focus:outline-none"
                      />
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    placeholder="Qty"
                    className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm text-center focus:border-emerald-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                    placeholder="Unit"
                    className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm text-right focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:bg-gray-50 cursor-pointer"
              >
                + Add line item
              </button>
            </div>
          </div>

          {/* Amount + balance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Amount Paid</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={itemsSubtotal.toFixed(2)}
                  className="w-full rounded-lg border border-gray-200 pl-6 pr-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <p className="mt-1 text-[10px] text-gray-400">Blank = sum of line items ({`$${itemsSubtotal.toFixed(2)}`})</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Balance Remaining</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={balanceRemaining}
                  onChange={(e) => setBalanceRemaining(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-200 pl-6 pr-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Payment Date</label>
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Payment details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
              <input
                type="text"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="Wire Transfer / ACH / Credit Card / Cash / Check"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reference / Confirmation #</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. #123456"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes on Receipt (visible to customer)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything you'd like the customer to see on their receipt."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none resize-none"
            />
          </div>

          {/* Internal reason */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Internal Reason (activity log only)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Adjustment for partial refund"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between border-t border-gray-100 bg-white px-6 py-4 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={sending}
            className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Send Receipt (${finalAmount.toFixed(2)})
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  const colors: Record<string, string> = {
    unpaid: "text-gray-500",
    paid: "text-green-600",
    deposit_paid: "text-emerald-600",
    not_sent: "text-gray-400",
    sent: "text-blue-600",
    signed: "text-green-600",
    pending: "text-yellow-600",
    ordered: "text-purple-600",
    shipped: "text-sky-600",
    delivered: "text-teal-600",
    completed: "text-green-700",
    cancelled: "text-red-600",
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-medium capitalize ${colors[value] || "text-gray-500"}`}>
        {formatStatus(value || "—")}
      </span>
    </div>
  );
}
