"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Package, Eye, RotateCcw, ArrowLeft } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

interface Order {
  id: string;
  order_number: string;
  status: string;
  subtotal: number;
  shipping_estimate: number;
  total: number;
  notes: string | null;
  created_at: string;
  coffee_order_items?: { id: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  awaiting_payment: "bg-orange-100 text-orange-700",
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function CoffeeOrdersPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reordering, setReordering] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.push("/login");
        return;
      }
      setToken(session.access_token);

      try {
        const profileRes = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (profileRes.ok) {
          const data: Profile = await profileRes.json();
          if (!data.coffee_access_enabled) {
            router.push("/coffee/apply");
            return;
          }
        }

        const ordersRes = await fetch("/api/coffee/orders", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (ordersRes.ok) {
          const data = await ordersRes.json();
          setOrders(data.orders || []);
        } else {
          console.error("[coffee/orders] Failed to fetch orders:", ordersRes.status);
        }
      } catch (err) {
        console.error("[coffee/orders] Error:", err);
      }
      setLoading(false);
    }
    init();
  }, [router]);

  async function handleReorder(orderId: string) {
    setReordering(orderId);
    try {
      const res = await fetch(`/api/coffee/orders/${orderId}/reorder`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`${data.added} item(s) added to cart`, "success");
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to reorder", "error");
      }
    } catch {
      showToast("Failed to reorder", "error");
    } finally {
      setReordering(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/coffee"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Marketplace
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Your Orders</h1>

      {orders.length === 0 ? (
        <div className="mt-16 flex flex-col items-center justify-center text-center">
          <Package className="h-16 w-16 text-gray-300 mb-4" />
          <p className="text-lg font-medium text-gray-600">No orders yet</p>
          <p className="mt-1 text-sm text-gray-500">Your order history will appear here</p>
          <Link
            href="/coffee"
            className="mt-6 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700"
          >
            Browse Marketplace
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 hidden sm:block">
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Order #</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Date</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Total</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Status</th>
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-5 py-4 font-medium text-gray-900">{order.order_number}</td>
                      <td className="px-5 py-4 text-gray-600">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 font-medium text-gray-900">${Number(order.total).toFixed(2)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"}`}>
                          {order.status === "awaiting_payment" ? "pending" : order.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/coffee/orders/${order.id}`}
                            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleReorder(order.id)}
                            disabled={reordering === order.id}
                            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50 cursor-pointer"
                          >
                            {reordering === order.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Reorder
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 space-y-4 sm:hidden">
            {orders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{order.order_number}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"}`}>
                    {order.status}
                  </span>
                </div>
                <p className="mt-3 text-lg font-bold text-gray-900">${Number(order.total).toFixed(2)}</p>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/coffee/orders/${order.id}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleReorder(order.id)}
                    disabled={reordering === order.id}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-600 transition-colors hover:bg-green-100 disabled:opacity-50 cursor-pointer"
                  >
                    {reordering === order.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Reorder
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
