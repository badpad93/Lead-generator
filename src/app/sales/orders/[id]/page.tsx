"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Loader2, Send, CheckCircle2, Circle, Plus, X } from "lucide-react";
import type { SalesOrder, FulfillmentItem } from "@/lib/salesTypes";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [checklist, setChecklist] = useState<FulfillmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [sending, setSending] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) setToken(session.access_token);
    }
    init();
  }, []);

  const fetchOrder = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    const [orderRes, checklistRes] = await Promise.all([
      fetch(`/api/sales/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/sales/orders/${id}/fulfillment`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (orderRes.ok) setOrder(await orderRes.json());
    if (checklistRes.ok) setChecklist(await checklistRes.json());
    setLoading(false);
  }, [token, id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  async function handleToggleItem(item: FulfillmentItem) {
    await fetch(`/api/sales/orders/${id}/fulfillment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ item_id: item.id, completed: !item.completed }),
    });
    fetchOrder();
  }

  async function handleAddItem() {
    if (!newLabel.trim()) return;
    await fetch(`/api/sales/orders/${id}/fulfillment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    setNewLabel("");
    setShowAddItem(false);
    fetchOrder();
  }

  async function handleSend() {
    setSending(true);
    const res = await fetch(`/api/sales/orders/${id}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await res.json().catch(() => ({}));
    if (result.emailSent) {
      const ccInfo = result.cc?.length ? `\nCC: ${result.cc.join(", ")}` : "";
      alert(`Order sent to ${result.recipient}${ccInfo}`);
      fetchOrder();
    } else {
      alert(`Email failed: ${result.emailError || "Unknown error"}`);
    }
    setSending(false);
  }

  async function handleMarkCompleted() {
    await fetch(`/api/sales/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "completed" }),
    });
    fetchOrder();
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;
  }

  if (!order) {
    return <div className="p-6 text-center text-gray-400">Order not found</div>;
  }

  const items = order.order_items || [];
  const completedCount = checklist.filter((c) => c.completed).length;
  const totalItems = checklist.length;

  const statusColor: Record<string, string> = {
    draft: "bg-gray-50 text-gray-600 ring-gray-200",
    sent: "bg-blue-50 text-blue-700 ring-blue-200",
    completed: "bg-green-50 text-green-700 ring-green-200",
  };

  return (
    <div className="p-6 max-w-4xl">
      <button onClick={() => router.push("/sales/orders")} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to Orders
      </button>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Order {order.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {(order.sales_accounts as { business_name: string } | null)?.business_name || "No account"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset capitalize ${statusColor[order.status] || ""}`}>
              {order.status}
            </span>
            <p className="text-2xl font-bold text-green-600">
              ${Number(order.total_value).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Order items */}
        {items.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Items</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/50">
                  <tr>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Service</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500 text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5 text-gray-900">{item.service_name}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                        ${Number(item.price).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Fulfillment Checklist */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Fulfillment Checklist</h2>
              {totalItems > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {completedCount}/{totalItems} completed
                </p>
              )}
            </div>
            <button
              onClick={() => setShowAddItem(!showAddItem)}
              className="inline-flex items-center gap-1 text-sm text-green-600 hover:text-green-700 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add Step
            </button>
          </div>

          {totalItems > 0 && (
            <div className="mb-3 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-300"
                style={{ width: `${totalItems > 0 ? (completedCount / totalItems) * 100 : 0}%` }}
              />
            </div>
          )}

          {showAddItem && (
            <div className="mb-3 flex gap-2">
              <input
                autoFocus
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                placeholder="Checklist step description"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
              <button onClick={handleAddItem} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">Add</button>
              <button onClick={() => { setShowAddItem(false); setNewLabel(""); }} className="rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-500 hover:bg-gray-50 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {checklist.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400 rounded-lg border border-dashed border-gray-200">
              No checklist items yet
            </p>
          ) : (
            <div className="space-y-1">
              {checklist.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleToggleItem(item)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  {item.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${item.completed ? "text-gray-400 line-through" : "text-gray-700"}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {order.status === "draft" && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending..." : "Send Order"}
            </button>
          )}
          {order.status === "sent" && (
            <button
              onClick={handleMarkCompleted}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark Completed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
