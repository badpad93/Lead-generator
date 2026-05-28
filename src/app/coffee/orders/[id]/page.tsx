"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, RotateCcw, Package } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface OrderItem {
  id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  shipping_name: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  shipping_phone: string | null;
  subtotal: number;
  shipping_estimate: number;
  total: number;
  notes: string | null;
  created_at: string;
  coffee_order_items: OrderItem[];
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function CoffeeOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
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
        const res = await fetch(`/api/coffee/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOrder(data.order);
        } else {
          router.push("/coffee/orders");
        }
      } catch {
        router.push("/coffee/orders");
      }
      setLoading(false);
    }
    init();
  }, [orderId, router]);

  async function handleReorder() {
    setReordering(true);
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
      setReordering(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <Package className="h-16 w-16 text-gray-300 mb-4" />
        <p className="text-lg font-medium text-gray-600">Order not found</p>
        <Link href="/coffee/orders" className="mt-4 text-sm font-medium text-green-600 hover:text-green-700">
          Back to Orders
        </Link>
      </div>
    );
  }

  const items = order.coffee_order_items || [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/coffee/orders"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Orders
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order {order.order_number}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Placed on {new Date(order.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium capitalize ${STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"}`}>
            {order.status}
          </span>
          <button
            type="button"
            onClick={handleReorder}
            disabled={reordering}
            className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 cursor-pointer"
          >
            {reordering ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Reorder
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="font-bold text-gray-900">Order Items</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Product</th>
                  <th className="px-5 py-3 text-center font-semibold text-gray-600">Qty</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-600">Unit Price</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900">{item.product_name}</p>
                      <p className="text-xs text-gray-500">{item.product_sku}</p>
                    </td>
                    <td className="px-5 py-4 text-center text-gray-600">{item.quantity}</td>
                    <td className="px-5 py-4 text-right text-gray-600">${Number(item.unit_price).toFixed(2)}</td>
                    <td className="px-5 py-4 text-right font-medium text-gray-900">${Number(item.line_total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {order.notes && (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-gray-900 mb-2">Notes</h2>
              <p className="text-sm text-gray-600">{order.notes}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-gray-900 mb-3">Shipping Information</h2>
            <div className="space-y-2 text-sm">
              {order.shipping_name && <p className="font-medium text-gray-900">{order.shipping_name}</p>}
              {order.shipping_address && <p className="text-gray-600">{order.shipping_address}</p>}
              {(order.shipping_city || order.shipping_state || order.shipping_zip) && (
                <p className="text-gray-600">
                  {[order.shipping_city, order.shipping_state].filter(Boolean).join(", ")}
                  {order.shipping_zip ? ` ${order.shipping_zip}` : ""}
                </p>
              )}
              {order.shipping_phone && <p className="text-gray-600">{order.shipping_phone}</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-gray-900 mb-3">Order Totals</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-900">${Number(order.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Shipping</span>
                <span className="font-medium text-gray-900">
                  {Number(order.shipping_estimate) === 0 ? "Free" : `$${Number(order.shipping_estimate).toFixed(2)}`}
                </span>
              </div>
              <hr className="border-gray-100 my-2" />
              <div className="flex justify-between">
                <span className="text-base font-bold text-gray-900">Total</span>
                <span className="text-base font-bold text-gray-900">${Number(order.total).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

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
