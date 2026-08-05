"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Package, ChevronLeft, Plus, Pencil, X, Search } from "lucide-react";

interface SKU {
  id: string;
  sku_code: string;
  name: string;
  description: string | null;
  category: string;
  unit_of_measure: string;
  pack_size: number;
  coffee_product_id: string | null;
  preferred_supplier_id: string | null;
  lead_time_days_override: number | null;
  safety_stock_pct_override: number | null;
  lookback_weeks_override: number | null;
  forecast_method_override: "simple" | "weighted" | null;
  active: boolean;
  notes: string | null;
}

interface Sup { id: string; name: string; }
interface CoffeeProduct { id: string; name: string; sku: string | null; }

export default function SkusPage() {
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<SKU[]>([]);
  const [suppliers, setSuppliers] = useState<Sup[]>([]);
  const [coffeeProducts, setCoffeeProducts] = useState<CoffeeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SKU | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
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
      const [skusRes, supRes, cpRes] = await Promise.all([
        fetch(`/api/admin/inventory/skus${search ? `?search=${encodeURIComponent(search)}` : ""}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/admin/inventory/suppliers?active=true", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        // Coffee products — try admin endpoint; fallback silently.
        fetch("/api/admin/coffee/products", {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ]);
      if (cancelled) return;
      if (skusRes.ok) {
        const { skus } = await skusRes.json();
        setRows(skus);
      }
      if (supRes.ok) {
        const { suppliers: sups } = await supRes.json();
        setSuppliers(sups);
      }
      if (cpRes && cpRes.ok) {
        const j = await cpRes.json();
        // Support both {products:[...]} and [...] shapes.
        const list = Array.isArray(j) ? j : (j.products ?? []);
        setCoffeeProducts(list.map((p: { id: string; name?: string; sku?: string | null }) => ({
          id: p.id,
          name: p.name ?? "(unnamed)",
          sku: p.sku ?? null,
        })));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, reloadKey, search]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.category));
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (categoryFilter === "all") return rows;
    return rows.filter((r) => r.category === categoryFilter);
  }, [rows, categoryFilter]);

  const supplierById = useMemo(() => {
    const m = new Map<string, string>();
    suppliers.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [suppliers]);

  const linkedCoffeeIds = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.coffee_product_id) s.add(r.coffee_product_id); });
    return s;
  }, [rows]);

  const unlinkedCoffeeCount = coffeeProducts.filter((p) => !linkedCoffeeIds.has(p.id)).length;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <Link href="/admin/inventory/setup" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ChevronLeft className="h-4 w-4" /> Setup
      </Link>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-emerald-600" /> SKUs
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Everything countable. Link a marketplace coffee product so fulfillment consumption bridges into the ledger automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> New SKU
        </button>
      </div>

      {unlinkedCoffeeCount > 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 p-3 text-sm">
          <strong>{unlinkedCoffeeCount}</strong> marketplace coffee product{unlinkedCoffeeCount === 1 ? "" : "s"} have no inventory SKU yet.
          Coffee orders for these products will be skipped by consumption tracking until a SKU is created and linked.
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sku code / name…"
            className="rounded-md border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm w-72"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <Loader2 className="inline h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">SKU code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Pack</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Coffee link</th>
                <th className="px-3 py-2">Overrides</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((s) => {
                const overrides: string[] = [];
                if (s.lead_time_days_override != null) overrides.push(`LT:${s.lead_time_days_override}d`);
                if (s.safety_stock_pct_override != null) overrides.push(`SS:${(s.safety_stock_pct_override * 100).toFixed(0)}%`);
                if (s.lookback_weeks_override != null) overrides.push(`Look:${s.lookback_weeks_override}w`);
                if (s.forecast_method_override) overrides.push(`Fcst:${s.forecast_method_override}`);
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{s.sku_code}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{s.name}</td>
                    <td className="px-3 py-2 text-gray-700">{s.category}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{s.pack_size}</td>
                    <td className="px-3 py-2 text-gray-700">{s.preferred_supplier_id ? (supplierById.get(s.preferred_supplier_id) ?? "—") : <span className="text-red-600">— none —</span>}</td>
                    <td className="px-3 py-2 text-xs">
                      {s.coffee_product_id ? (
                        <span className="text-emerald-700">✓ linked</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{overrides.length ? overrides.join(" · ") : <span className="text-gray-300">—</span>}</td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && token && (
        <SkuModal
          token={token}
          row={editing}
          suppliers={suppliers}
          coffeeProducts={coffeeProducts}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); reload(); }}
        />
      )}
    </div>
  );
}

function SkuModal({
  token,
  row,
  suppliers,
  coffeeProducts,
  onClose,
  onSaved,
}: {
  token: string;
  row: SKU | null;
  suppliers: Sup[];
  coffeeProducts: CoffeeProduct[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    sku_code: row?.sku_code ?? "",
    name: row?.name ?? "",
    description: row?.description ?? "",
    category: row?.category ?? "coffee",
    unit_of_measure: row?.unit_of_measure ?? "each",
    pack_size: String(row?.pack_size ?? 1),
    coffee_product_id: row?.coffee_product_id ?? "",
    preferred_supplier_id: row?.preferred_supplier_id ?? "",
    lead_time_days_override: row?.lead_time_days_override != null ? String(row.lead_time_days_override) : "",
    safety_stock_pct_override: row?.safety_stock_pct_override != null ? String(row.safety_stock_pct_override * 100) : "",
    lookback_weeks_override: row?.lookback_weeks_override != null ? String(row.lookback_weeks_override) : "",
    forecast_method_override: row?.forecast_method_override ?? "",
    active: row?.active ?? true,
    notes: row?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      sku_code: form.sku_code,
      name: form.name,
      description: form.description || null,
      category: form.category,
      unit_of_measure: form.unit_of_measure,
      pack_size: Number(form.pack_size) || 1,
      coffee_product_id: form.coffee_product_id || null,
      preferred_supplier_id: form.preferred_supplier_id || null,
      lead_time_days_override: form.lead_time_days_override ? Number(form.lead_time_days_override) : null,
      safety_stock_pct_override: form.safety_stock_pct_override ? Number(form.safety_stock_pct_override) / 100 : null,
      lookback_weeks_override: form.lookback_weeks_override ? Number(form.lookback_weeks_override) : null,
      forecast_method_override: form.forecast_method_override || null,
      active: form.active,
      notes: form.notes || null,
    };
    const url = row
      ? `/api/admin/inventory/skus/${row.id}`
      : "/api/admin/inventory/skus";
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
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{row ? "Edit SKU" : "New SKU"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="SKU code *" value={form.sku_code} onChange={(v) => setForm({ ...form, sku_code: v })} />
            <TextField label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          </div>
          <TextField label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
          <div className="grid grid-cols-3 gap-3">
            <TextField label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} placeholder="coffee / cups / brewers / …" />
            <TextField label="Unit of measure" value={form.unit_of_measure} onChange={(v) => setForm({ ...form, unit_of_measure: v })} placeholder="each / case / lb" />
            <TextField label="Pack size" value={form.pack_size} onChange={(v) => setForm({ ...form, pack_size: v })} type="number" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Preferred supplier" value={form.preferred_supplier_id} onChange={(v) => setForm({ ...form, preferred_supplier_id: v })}>
              <option value="">— none —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectField>
            <SelectField label="Coffee product link" value={form.coffee_product_id} onChange={(v) => setForm({ ...form, coffee_product_id: v })}>
              <option value="">— none —</option>
              {coffeeProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
            </SelectField>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">Per-SKU forecast overrides (all optional)</div>
            <div className="grid grid-cols-4 gap-3">
              <TextField label="Lead time (days)" value={form.lead_time_days_override} onChange={(v) => setForm({ ...form, lead_time_days_override: v })} type="number" placeholder="inherit" />
              <TextField label="Safety stock %" value={form.safety_stock_pct_override} onChange={(v) => setForm({ ...form, safety_stock_pct_override: v })} type="number" placeholder="inherit" />
              <TextField label="Lookback weeks" value={form.lookback_weeks_override} onChange={(v) => setForm({ ...form, lookback_weeks_override: v })} type="number" placeholder="inherit" />
              <SelectField label="Method" value={form.forecast_method_override} onChange={(v) => setForm({ ...form, forecast_method_override: v })}>
                <option value="">inherit</option>
                <option value="simple">simple</option>
                <option value="weighted">weighted</option>
              </SelectField>
            </div>
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
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2">Cancel</button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !form.sku_code.trim() || !form.name.trim()}
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

function TextField({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
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

function SelectField({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white">
        {children}
      </select>
    </div>
  );
}
