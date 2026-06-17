"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Suspense } from "react";
import {
  Loader2, ArrowLeft, Plus, X, Package, MapPin, Coffee, Monitor, Wrench, DollarSign,
} from "lucide-react";

interface Account {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
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

interface ItemForm {
  item_type: string;
  item_name: string;
  description: string;
  quantity: string;
  unit_price: string;
  deposit_required: boolean;
  location_deposit_amount: string;
  location_service_price: string;
}

function NewOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = searchParams.get("lead_id");
  const accountId = searchParams.get("account_id");

  const [token, setToken] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    account_id: accountId || "",
    lead_id: leadId || "",
    order_type: "",
    notes: "",
    next_required_action: "Collect customer business information",
  });

  const [items, setItems] = useState<ItemForm[]>([
    { item_type: "machine_sale", item_name: "", description: "", quantity: "1", unit_price: "", deposit_required: false, location_deposit_amount: "100", location_service_price: "" },
  ]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/sales/accounts", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  function addItem() {
    setItems((prev) => [...prev, { item_type: "machine_sale", item_name: "", description: "", quantity: "1", unit_price: "", deposit_required: false, location_deposit_amount: "100", location_service_price: "" }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: string, value: string | boolean) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function handleCreate() {
    setSaving(true);
    const cleanItems = items
      .filter((i) => i.item_name.trim())
      .map((i) => ({
        item_type: i.item_type,
        item_name: i.item_name.trim(),
        description: i.description.trim() || null,
        quantity: Number(i.quantity) || 1,
        unit_price: Number(i.unit_price) || 0,
        deposit_required: i.deposit_required,
        location_deposit_amount: i.deposit_required ? Number(i.location_deposit_amount) || 100 : null,
        location_service_price: i.item_type === "location_services" ? Number(i.location_service_price) || 0 : null,
      }));

    const res = await fetch("/api/sales/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        account_id: form.account_id || null,
        lead_id: form.lead_id || null,
        order_type: form.order_type || null,
        notes: form.notes || null,
        next_required_action: form.next_required_action || null,
        items: cleanItems,
      }),
    });

    if (res.ok) {
      const order = await res.json();
      router.push(`/sales/orders/${order.id}`);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to create order");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-600 mb-4 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Order</h1>

      {/* Order Info */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Order Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Account</label>
            <select
              value={form.account_id}
              onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            >
              <option value="">Select account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.business_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Order Type</label>
            <select
              value={form.order_type}
              onChange={(e) => setForm((f) => ({ ...f, order_type: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            >
              <option value="">General</option>
              <option value="machine_sale">Machine Sale</option>
              <option value="location_services">Location Services</option>
              <option value="coffee_program">Coffee Program</option>
              <option value="combo">Combo / Bundle</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-500 mb-1 block">Next Required Action</label>
          <input
            value={form.next_required_action}
            onChange={(e) => setForm((f) => ({ ...f, next_required_action: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-500 mb-1 block">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            rows={2}
          />
        </div>
      </div>

      {/* Items */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Items</h3>
          <button onClick={addItem} className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> Add Item
          </button>
        </div>

        <div className="space-y-4">
          {items.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-gray-100 p-4 relative">
              {items.length > 1 && (
                <button
                  onClick={() => removeItem(idx)}
                  className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Type</label>
                  <select
                    value={item.item_type}
                    onChange={(e) => updateItem(idx, "item_type", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    {ITEM_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Name</label>
                  <input
                    placeholder="e.g. VendEra AI Cooler"
                    value={item.item_name}
                    onChange={(e) => updateItem(idx, "item_name", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Unit Price ($)</label>
                  <input
                    type="number"
                    value={item.unit_price}
                    onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                {item.item_type === "location_services" && (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Service Total Price ($)</label>
                      <input
                        type="number"
                        value={item.location_service_price}
                        onChange={(e) => updateItem(idx, "location_service_price", e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer pb-2">
                        <input
                          type="checkbox"
                          checked={item.deposit_required}
                          onChange={(e) => updateItem(idx, "deposit_required", e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-green-600"
                        />
                        <span className="text-xs text-gray-600">$100 deposit required</span>
                      </label>
                    </div>
                  </>
                )}
              </div>
              {item.item_name && item.unit_price && (
                <p className="text-xs text-gray-400 mt-2">
                  Subtotal: ${((Number(item.quantity) || 1) * (Number(item.unit_price) || 0)).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create button */}
      <div className="flex gap-3">
        <button
          onClick={handleCreate}
          disabled={saving || items.every((i) => !i.item_name.trim())}
          className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Creating..." : "Create Order"}
        </button>
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-gray-200 px-6 py-2.5 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>}>
      <NewOrderContent />
    </Suspense>
  );
}
