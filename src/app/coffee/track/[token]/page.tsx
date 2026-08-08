"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle, Package, Truck, Home, Clock } from "lucide-react";

interface OrderData {
  email: string;
  claimed: boolean;
  order: {
    id: string;
    order_number: string;
    status: string;
    subtotal: number;
    shipping_estimate: number;
    total: number;
    created_at: string;
    shipping: {
      business_name: string | null;
      contact_name: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      phone: string | null;
    };
    billing: {
      business_name: string | null;
      contact_name: string | null;
      email: string | null;
      phone: string | null;
    };
    items: Array<{
      id: string;
      product_name: string;
      product_sku: string | null;
      quantity: number;
      unit_price: number;
      line_total: number;
    }>;
  };
  workflow: {
    id: string;
    overall_status: string;
    current_stage_key: string | null;
    stages: Array<{ key: string; name: string; status: string }>;
  } | null;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  awaiting_payment: <Clock className="h-5 w-5" />,
  pending: <Clock className="h-5 w-5" />,
  processing: <Package className="h-5 w-5" />,
  shipped: <Truck className="h-5 w-5" />,
  delivered: <Home className="h-5 w-5" />,
  cancelled: <AlertCircle className="h-5 w-5" />,
};

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function TrackOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const searchParams = useSearchParams();
  const paidRecent = searchParams.get("paid") === "true";
  const [data, setData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/coffee/guest-track/${encodeURIComponent(token)}`);
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || "Failed to load order.");
        } else {
          setData(body);
        }
      } catch {
        setError("Failed to load order.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-lg bg-gray-900 border border-red-500/40 p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-xl font-semibold mb-2">Can&apos;t load this order</h1>
          <p className="text-gray-400 mb-6">{error || "Unknown error"}</p>
          <Link href="/coffee" className="inline-block bg-green-500 text-black font-semibold px-6 py-3 rounded-lg hover:bg-green-400">
            Back to shop
          </Link>
        </div>
      </div>
    );
  }

  const { order, workflow, claimed, email } = data;
  const statusIcon = STATUS_ICONS[order.status] || <Package className="h-5 w-5" />;
  const statusLabel = STATUS_LABELS[order.status] || order.status;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {paidRecent && (
          <div className="rounded-lg bg-green-900/40 border border-green-500/40 p-4 mb-6 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-green-100 font-semibold">Payment received</p>
              <p className="text-green-100/80 text-sm">Your order is now being processed.</p>
            </div>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Order {order.order_number}</h1>
          <p className="text-gray-400 mt-1">
            Placed {new Date(order.created_at).toLocaleDateString()} · {email}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-lg bg-gray-900 border border-gray-800 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-full bg-green-500/20 text-green-400">
                  {statusIcon}
                </div>
                <div>
                  <p className="text-sm text-gray-400">Current status</p>
                  <p className="text-xl font-semibold">{statusLabel}</p>
                </div>
              </div>

              {workflow && workflow.stages.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-800">
                  <p className="text-sm font-semibold text-gray-300 mb-3">Fulfillment progress</p>
                  <ol className="space-y-2">
                    {workflow.stages.map((stage) => (
                      <li key={stage.key} className="flex items-center gap-3 text-sm">
                        <StageDot status={stage.status} />
                        <span className={stage.status === "completed" ? "text-green-400" : stage.status === "in_progress" ? "text-white font-medium" : "text-gray-500"}>
                          {stage.name}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-gray-900 border border-gray-800 p-6">
              <h2 className="text-lg font-semibold mb-4">Items</h2>
              <ul className="divide-y divide-gray-800">
                {order.items.map((item) => (
                  <li key={item.id} className="py-3 flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="text-white">{item.product_name}</p>
                      {item.product_sku && <p className="text-xs text-gray-500">SKU: {item.product_sku}</p>}
                      <p className="text-xs text-gray-500">Qty: {item.quantity} × ${item.unit_price.toFixed(2)}</p>
                    </div>
                    <p className="text-white font-medium">${item.line_total.toFixed(2)}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-4 border-t border-gray-800 space-y-1 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal</span>
                  <span className="text-white">${order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Shipping</span>
                  <span className="text-white">${order.shipping_estimate.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-800 mt-2">
                  <span>Total</span>
                  <span className="text-green-400">${order.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <aside className="lg:col-span-1 space-y-6">
            {!claimed && (
              <div className="rounded-lg bg-green-900/20 border border-green-500/40 p-6">
                <h3 className="font-semibold mb-2 text-green-100">Claim your account</h3>
                <p className="text-sm text-green-100/80 mb-4">
                  Set a password so you can sign in to reorder, track future shipments,
                  and view your order history.
                </p>
                <p className="text-xs text-green-100/60">
                  Check your email — we sent a claim link when you placed this order.
                </p>
              </div>
            )}

            <div className="rounded-lg bg-gray-900 border border-gray-800 p-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Shipping to</h3>
              <p className="text-white">{order.shipping.business_name}</p>
              <p className="text-gray-300 text-sm">{order.shipping.contact_name}</p>
              <p className="text-gray-300 text-sm">{order.shipping.address}</p>
              <p className="text-gray-300 text-sm">
                {order.shipping.city}, {order.shipping.state} {order.shipping.zip}
              </p>
              {order.shipping.phone && <p className="text-gray-500 text-xs mt-2">{order.shipping.phone}</p>}
            </div>

            <div className="rounded-lg bg-gray-900 border border-gray-800 p-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Billed to</h3>
              <p className="text-white">{order.billing.business_name}</p>
              <p className="text-gray-300 text-sm">{order.billing.contact_name}</p>
              <p className="text-gray-300 text-sm">{order.billing.email}</p>
              {order.billing.phone && <p className="text-gray-500 text-xs mt-2">{order.billing.phone}</p>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StageDot({ status }: { status: string }) {
  if (status === "completed") {
    return <span className="h-2 w-2 rounded-full bg-green-500" />;
  }
  if (status === "in_progress") {
    return <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />;
  }
  return <span className="h-2 w-2 rounded-full bg-gray-600" />;
}
