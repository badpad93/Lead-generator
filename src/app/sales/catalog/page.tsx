"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  Loader2, Plus, Pencil, PackageCheck, PackageX, BookOpen, X,
} from "lucide-react";

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  item_type: string;
  unit_price: number;
  sku: string | null;
  active: boolean;
  created_at: string;
}

const ITEM_TYPES = [
  { value: "machine_sale", label: "Machine Sale" },
  { value: "location_services", label: "Location Services" },
  { value: "coffee_program", label: "Coffee Program" },
  { value: "vendera_ai_cooler", label: "VendEra AI Cooler" },
  { value: "combo_machine", label: "Combo Machine" },
  { value: "financing", label: "Financing" },
  { value: "other", label: "Other" },
];

function formatType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [userRole, setUserRole] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    item_type: "other",
    unit_price: "",
    sku: "",
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      setToken(session.access_token);
      const res = await fetch("/api/sales/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const users = await res.json();
        const me = users.find((u: { id: string }) => u.id === session.user.id);
        if (me) setUserRole(me.role || "");
      }
    });
  }, []);

  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = showInactive ? "?active=false" : "";
    const res = await fetch(`/api/sales/catalog-items${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [token, showInactive]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const isAdmin = userRole === "admin" || userRole === "director_of_sales";

  function openAdd() {
    setEditId(null);
    setForm({ name: "", description: "", item_type: "other", unit_price: "", sku: "" });
    setShowForm(true);
  }

  function openEdit(item: CatalogItem) {
    setEditId(item.id);
    setForm({
      name: item.name,
      description: item.description || "",
      item_type: item.item_type,
      unit_price: String(item.unit_price || ""),
      sku: item.sku || "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      ...(editId ? { id: editId } : {}),
      name: form.name.trim(),
      description: form.description.trim() || null,
      item_type: form.item_type,
      unit_price: Number(form.unit_price) || 0,
      sku: form.sku.trim() || null,
    };

    const res = await fetch("/api/sales/catalog-items", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setShowForm(false);
      setEditId(null);
      fetchItems();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to save");
    }
    setSaving(false);
  }

  async function toggleActive(item: CatalogItem) {
    await fetch("/api/sales/catalog-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: item.id, active: !item.active }),
    });
    fetchItems();
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-green-100">
            <BookOpen className="w-5 h-5 text-green-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Item Catalog</h1>
            <p className="text-sm text-gray-500 mt-0.5">Reusable items for orders and quotes</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        )}
      </div>

      {/* Show inactive toggle */}
      <div className="mb-4">
        <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-500">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-green-600"
          />
          Show all (including inactive)
        </label>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {editId ? "Edit Catalog Item" : "Add Catalog Item"}
            </h3>
            <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. VendEra AI Cooler"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">SKU</label>
              <input
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="e.g. VND-AIC-001"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Type</label>
              <select
                value={form.item_type}
                onChange={(e) => setForm((f) => ({ ...f, item_type: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Unit Price ($)</label>
              <input
                type="number"
                value={form.unit_price}
                onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs text-gray-500 mb-1 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional description..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              rows={2}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : editId ? "Update Item" : "Add Item"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Items Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-green-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No catalog items yet. Add your first item to get started.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">SKU</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Price</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                {isAdmin && <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{item.name}</p>
                    {item.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[250px]">{item.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatType(item.item_type)}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{item.sku || "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    ${Number(item.unit_price).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
                        <PackageCheck className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
                        <PackageX className="h-3 w-3" /> Inactive
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 text-gray-400 hover:text-green-600 cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => toggleActive(item)}
                          className={`text-xs px-2 py-1 rounded cursor-pointer ${
                            item.active
                              ? "text-red-600 hover:bg-red-50"
                              : "text-green-600 hover:bg-green-50"
                          }`}
                        >
                          {item.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
