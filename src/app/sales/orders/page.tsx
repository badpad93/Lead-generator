"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import {
  Loader2, ClipboardList, Plus, Search, AlertCircle,
  ChevronRight, Package, MapPin, Coffee, Monitor, Wrench, DollarSign, FileText,
} from "lucide-react";

interface OrderItem {
  id: string;
  item_type: string;
  service_name: string;
  quantity: number;
  total_price: number;
}

interface Order {
  id: string;
  order_number: number;
  order_status: string;
  order_type: string | null;
  document_type: string | null;
  total_value: number;
  payment_status: string;
  invoice_status: string;
  agreement_status: string;
  fulfillment_status: string;
  next_required_action: string | null;
  created_at: string;
  updated_at: string;
  sales_accounts: { id: string; business_name: string; contact_name: string; email: string; phone: string } | null;
  order_items: OrderItem[];
  assigned_profile: { full_name: string } | null;
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "awaiting_customer_info", label: "Awaiting Info" },
  { key: "invoice_sent", label: "Invoice Sent" },
  { key: "awaiting_signature", label: "Awaiting Signature" },
  { key: "awaiting_payment", label: "Awaiting Payment" },
  { key: "deposit_paid", label: "Deposit Paid" },
  { key: "paid", label: "Paid" },
  { key: "machine_ordered", label: "Fulfillment" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
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

const ITEM_ICONS: Record<string, React.ElementType> = {
  machine_sale: Package,
  location_services: MapPin,
  coffee_program: Coffee,
  vendera_ai_cooler: Monitor,
  combo_machine: Package,
  financing: DollarSign,
  other: Wrench,
};

function formatStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function itemsSummary(items: OrderItem[]): string {
  if (!items || items.length === 0) return "No items";
  if (items.length === 1) {
    return `${items[0].quantity}x ${items[0].service_name}`;
  }
  const total = items.reduce((s, i) => s + (i.quantity || 1), 0);
  return `${total} items`;
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<"order" | "quote">("order");

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    params.set("document_type", docType);
    const res = await fetch(`/api/sales/orders?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  }, [token, statusFilter, search, docType]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const isQuote = docType === "quote";
  const docLabel = isQuote ? "Quote" : "Order";

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders / Quotes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage orders, quotes, and fulfillment</p>
        </div>
        <button
          onClick={() => router.push(`/sales/orders/new?type=${docType}`)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New {docLabel}
        </button>
      </div>

      {/* Document Type Toggle */}
      <div className="mb-4 flex items-center gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          onClick={() => { setDocType("order"); setStatusFilter("all"); }}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
            docType === "order"
              ? "bg-white text-green-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <ClipboardList className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          Orders
        </button>
        <button
          onClick={() => { setDocType("quote"); setStatusFilter("all"); }}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
            docType === "quote"
              ? "bg-white text-green-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <FileText className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          Quotes
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={`Search customer or ${docLabel.toLowerCase()} #...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === f.key
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-green-600" />
        </div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center">
          {isQuote ? <FileText className="mx-auto h-10 w-10 text-gray-300 mb-3" /> : <ClipboardList className="mx-auto h-10 w-10 text-gray-300 mb-3" />}
          <p className="text-sm text-gray-400">
            {statusFilter !== "all" ? `No ${docLabel.toLowerCase()}s match this filter.` : `No ${docLabel.toLowerCase()}s yet. Create one to get started.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const Icon = order.order_items?.[0]?.item_type
              ? ITEM_ICONS[order.order_items[0].item_type] || Wrench
              : isQuote ? FileText : ClipboardList;
            return (
              <div
                key={order.id}
                onClick={() => router.push(`/sales/orders/${order.id}`)}
                className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 hover:border-green-200 hover:shadow-sm transition-all cursor-pointer"
              >
                {/* Icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 group-hover:bg-green-50 transition-colors">
                  <Icon className="h-5 w-5 text-gray-400 group-hover:text-green-600" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-400">#{order.order_number || order.id.slice(0, 6).toUpperCase()}</span>
                    <span className="font-semibold text-gray-900 truncate">
                      {order.sales_accounts?.business_name || "Unassigned"}
                    </span>
                    {isQuote && (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 ring-1 ring-indigo-200">QUOTE</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                    <span>{itemsSummary(order.order_items)}</span>
                    <span>${Number(order.total_value || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    {order.assigned_profile?.full_name && (
                      <span className="text-gray-400">{order.assigned_profile.full_name}</span>
                    )}
                  </div>
                </div>

                {/* Next action */}
                {order.next_required_action && (
                  <div className="hidden md:flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 max-w-[220px]">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span className="text-xs font-medium text-amber-700 truncate">{order.next_required_action}</span>
                  </div>
                )}

                {/* Status */}
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_COLORS[order.order_status] || STATUS_COLORS.draft}`}>
                  {formatStatus(order.order_status || "draft")}
                </span>

                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-green-500 shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
