"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, ClipboardList, Plus, Trash2, X } from "lucide-react";
import type { SalesOrder, SalesAccount } from "@/lib/salesTypes";

interface NewOrderItem {
  service_name: string;
  price: string;
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    account_id: "",
    recipient_email: "",
    notes: "",
  });
  const [items, setItems] = useState<NewOrderItem[]>([{ service_name: "", price: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, []);

  const fetchAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    const [ordersRes, accountsRes] = await Promise.all([
      fetch("/api/sales/orders", { headers }),
      fetch("/api/sales/accounts", { headers }),
    ]);
    if (ordersRes.ok) setOrders(await ordersRes.json());
    if (accountsRes.ok) setAccounts(await accountsRes.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleCreate() {
    setSaving(true);
    const cleanItems = items
      .filter((i) => i.service_name.trim())
      .map((i) => ({ service_name: i.service_name.trim(), price: Number(i.price) || 0 }));
    const res = await fetch("/api/sales/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        account_id: form.account_id || null,
        recipient_email: form.recipient_email || null,
        notes: form.notes || null,
        items: cleanItems,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to create order");
      return;
    }
    setForm({ account_id: "", recipient_email: "", notes: "" });
    setItems([{ service_name: "", price: "" }]);
    setShowAdd(false);
    fetchAll();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this order?")) return;
    const res = await fetch(`/api/sales/orders/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to delete");
      return;
    }
    fetchAll();
  }

  const statusColor: Record<string, string> = {
    draft: "bg-gray-50 text-gray-600 ring-gray-200",
    sent: "bg-blue-50 text-blue-700 ring-blue-200",
    completed: "bg-green-50 text-green-700 ring-green-200",
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Order
        </button>
      </div>

      {showAdd && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">New Order</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={form.account_id}
              onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            >
              <option value="">Select account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.business_name}</option>
              ))}
            </select>
            <input
              type="email"
              placeholder="Recipient email"
              value={form.recipient_email}
              onChange={(e) => setForm((f) => ({ ...f, recipient_email: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </div>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            rows={2}
          />

          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-700 mb-2">Items</p>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    placeholder="Service / Item"
                    value={item.service_name}
                    onChange={(e) =>
                      setItems((prev) => prev.map((it, i) => i === idx ? { ...it, service_name: e.target.value } : it))
                    }
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Price"
                    value={item.price}
                    onChange={(e) =>
                      setItems((prev) => prev.map((it, i) => i === idx ? { ...it, price: e.target.value } : it))
                    }
                    className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                  <button
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setItems((prev) => [...prev, { service_name: "", price: "" }])}
              className="mt-2 text-xs text-green-600 hover:text-green-700 cursor-pointer"
            >
              + Add item
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : "Create Order"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No orders yet. Use &quot;New Order&quot; or finalize a deal.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Order ID</th>
                <th className="px-4 py-3 font-medium text-gray-500">Customer</th>
                <th className="px-4 py-3 font-medium text-gray-500">Items</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Total</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Sent To</th>
                <th className="px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => router.push(`/sales/orders/${order.id}`)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{order.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-4 py-3 text-gray-900">
                    {(order.sales_accounts as { business_name: string } | null)?.business_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{order.order_items?.length || 0} items</td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">
                    ${Number(order.total_value).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize ${statusColor[order.status] || ""}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{order.recipient_email || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(order.id)}
                      title="Delete"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
