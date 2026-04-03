"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, ClipboardList } from "lucide-react";
import type { SalesOrder } from "@/lib/salesTypes";

export default function OrdersPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) setToken(session.access_token);
    }
    init();
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/sales/orders", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const statusColor: Record<string, string> = {
    draft: "bg-gray-50 text-gray-600 ring-gray-200",
    sent: "bg-blue-50 text-blue-700 ring-blue-200",
    completed: "bg-green-50 text-green-700 ring-green-200",
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Orders</h1>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No orders yet. Create orders from deal detail pages.</p>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/50">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
