"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Truck, ChevronLeft, Plus, Pencil, X } from "lucide-react";

interface Sup {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  lead_time_days: number;
  minimum_order_qty: number | null;
  payment_terms: string | null;
  notes: string | null;
  active: boolean;
}

export default function SuppliersPage() {
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<Sup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Sup | null>(null);
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;
      setToken(session.access_token);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch("/api/admin/inventory/suppliers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok && !cancelled) {
        const { suppliers } = await res.json();
        setRows(suppliers);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, reloadKey]);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Link href="/admin/inventory/setup" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ChevronLeft className="h-4 w-4" /> Setup
      </Link>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Truck className="h-6 w-6 text-emerald-600" /> Suppliers
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Vendors you buy from. Default lead time is inherited by SKUs but can be overridden per-SKU.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> New Supplier
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <Loader2 className="inline h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No suppliers yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Email / Phone</th>
                <th className="px-3 py-2 text-right">Lead Time</th>
                <th className="px-3 py-2 text-right">Min Qty</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{s.name}</td>
                  <td className="px-3 py-2 text-gray-700">{s.contact_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {s.contact_email ?? ""} {s.contact_phone ? ` · ${s.contact_phone}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{s.lead_time_days}d</td>
                  <td className="px-3 py-2 text-right text-gray-700">{s.minimum_order_qty ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${s.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {s.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      className="text-emerald-700 hover:bg-emerald-50 p-1 rounded"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && token && (
        <SupplierModal
          token={token}
          row={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); reload(); }}
        />
      )}
    </div>
  );
}

function SupplierModal({
  token,
  row,
  onClose,
  onSaved,
}: {
  token: string;
  row: Sup | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: row?.name ?? "",
    contact_name: row?.contact_name ?? "",
    contact_email: row?.contact_email ?? "",
    contact_phone: row?.contact_phone ?? "",
    address: row?.address ?? "",
    lead_time_days: String(row?.lead_time_days ?? 7),
    minimum_order_qty: row?.minimum_order_qty != null ? String(row.minimum_order_qty) : "",
    payment_terms: row?.payment_terms ?? "",
    notes: row?.notes ?? "",
    active: row?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: form.name,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      address: form.address || null,
      lead_time_days: Number(form.lead_time_days) || 7,
      minimum_order_qty: form.minimum_order_qty ? Number(form.minimum_order_qty) : null,
      payment_terms: form.payment_terms || null,
      notes: form.notes || null,
      active: form.active,
    };
    const url = row
      ? `/api/admin/inventory/suppliers/${row.id}`
      : "/api/admin/inventory/suppliers";
    const res = await fetch(url, {
      method: row ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Save failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{row ? "Edit supplier" : "New supplier"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <Input label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contact name" value={form.contact_name} onChange={(v) => setForm({ ...form, contact_name: v })} />
            <Input label="Contact email" value={form.contact_email} onChange={(v) => setForm({ ...form, contact_email: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contact phone" value={form.contact_phone} onChange={(v) => setForm({ ...form, contact_phone: v })} />
            <Input label="Payment terms" value={form.payment_terms} onChange={(v) => setForm({ ...form, payment_terms: v })} placeholder="Net 30" />
          </div>
          <Input label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Lead time (days)" value={form.lead_time_days} onChange={(v) => setForm({ ...form, lead_time_days: v })} type="number" />
            <Input label="Minimum order qty" value={form.minimum_order_qty} onChange={(v) => setForm({ ...form, minimum_order_qty: v })} type="number" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active
          </label>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2">Cancel</button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !form.name.trim()}
              className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : row ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
    </div>
  );
}
