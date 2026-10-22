"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";

interface Brand {
  id: string;
  name: string;
  slug: string;
  blurb: string | null;
  active: boolean;
  sort_order: number;
  logo_path: string | null;
  logo_url: string | null;
}

interface AssignMachine {
  id: string;
  name: string;
  active: boolean | null;
  price_cents: number | null;
  brand_id: string | null;
}

async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export default function VendingBrandsManager({ token }: { token: string }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api("/api/admin/vending-brands", token);
      setBrands(data.brands || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const run = async () => { await refresh(); };
    run();
  }, [refresh]);

  async function addBrand() {
    setAdding(true);
    setError(null);
    try {
      // Distinct default name so repeated adds are distinguishable in the list
      // and the assignment dropdown (rename each to the real brand after).
      const defaultName = brands.length === 0 ? "New brand" : `New brand ${brands.length + 1}`;
      await api("/api/admin/vending-brands", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: defaultName, active: false }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading brands…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">AI Vending Brands</h2>
            <p className="text-sm text-gray-500">
              Brands shown on <span className="font-mono">/smart-coolers</span>; each links to its lineup at{" "}
              <span className="font-mono">/brands/&lt;slug&gt;</span>. Only active brands appear.
            </p>
          </div>
          <button
            onClick={addBrand}
            disabled={adding}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add brand
          </button>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {brands.map((b) => (
          <BrandEditor key={b.id} brand={b} token={token} onChanged={refresh} />
        ))}
        {brands.length === 0 && <p className="text-sm text-gray-400">No brands yet. Add one to get started.</p>}
      </div>

      <MachineAssignment token={token} brands={brands} />
    </div>
  );
}

function BrandEditor({ brand, token, onChanged }: { brand: Brand; token: string; onChanged: () => void }) {
  const [form, setForm] = useState(brand);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const set = (key: keyof Brand, value: string | number | boolean) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await api(`/api/admin/vending-brands/${brand.id}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          blurb: form.blurb,
          active: form.active,
          sort_order: Number(form.sort_order) || 0,
        }),
      });
      setMsg("Saved");
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${form.name}"? Machines stay but become unassigned.`)) return;
    try {
      await api(`/api/admin/vending-brands/${brand.id}`, token, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <LogoControl brand={brand} token={token} />
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Name</span>
              <input value={form.name} onChange={(e) => set("name", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Slug (URL)</span>
              <input value={form.slug} onChange={(e) => set("slug", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:border-green-500 focus:outline-none" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Blurb</span>
            <textarea value={form.blurb || ""} onChange={(e) => set("blurb", e.target.value)} rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Sort order
              <input type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)}
                className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:outline-none" />
            </label>
            <div className="ml-auto flex items-center gap-2">
              {msg && <span className="text-xs text-gray-500">{msg}</span>}
              <button onClick={remove} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
              <button onClick={save} disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoControl({ brand, token }: { brand: Brand; token: string }) {
  const [url, setUrl] = useState<string | null>(brand.logo_url);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await api(`/api/admin/vending-brands/${brand.id}/logo`, token, { method: "PUT", body: fd });
      setUrl(data.logo_url || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/admin/vending-brands/${brand.id}/logo`, token, { method: "DELETE" });
      setUrl(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full sm:w-40">
      <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gray-100 p-3">
        {url ? (
          <Image src={url} alt={brand.name} fill unoptimized className="object-contain p-3" />
        ) : (
          <span className="text-xs text-gray-400">No logo</span>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <Upload className="h-3.5 w-3.5" /> {url ? "Replace" : "Upload"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ""; }} />
        </label>
        {url && (
          <button onClick={clear} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50" title="Remove logo">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

function MachineAssignment({ token, brands }: { token: string; brands: Brand[] }) {
  const [machines, setMachines] = useState<AssignMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api("/api/admin/vending-brands/machines", token);
      setMachines(data.machines || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load machines");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const run = async () => { await refresh(); };
    run();
  }, [refresh]);

  async function assign(machineId: string, brandId: string) {
    setMachines((ms) => ms.map((m) => (m.id === machineId ? { ...m, brand_id: brandId || null } : m)));
    try {
      await api("/api/admin/vending-brands/machines", token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machine_id: machineId, brand_id: brandId || null }),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Assign failed");
      refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-bold text-gray-900">Assign AI coolers to brands</h3>
        <p className="text-sm text-gray-500">
          Coolers come from the Smart Coolers inventory. Each brand page shows the coolers assigned to it;
          give a cooler a Sale price (in the Smart Coolers tab) so it can be purchased.
        </p>
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
      <AssignmentBody loading={loading} machines={machines} brands={brands} assign={assign} />
    </div>
  );
}

function AssignmentBody({
  loading, machines, brands, assign,
}: {
  loading: boolean;
  machines: AssignMachine[];
  brands: Brand[];
  assign: (machineId: string, brandId: string) => void;
}) {
  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (machines.length === 0) {
    return <p className="text-sm text-gray-400">No smart coolers yet. Add them in the Smart Coolers tab.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Cooler</th>
            <th className="px-3 py-2">Active</th>
            <th className="px-3 py-2">Buyable</th>
            <th className="px-3 py-2">Brand</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {machines.map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2 font-medium text-gray-800">{m.name}</td>
              <td className="px-3 py-2 text-gray-500">{m.active ? "Yes" : "No"}</td>
              <td className="px-3 py-2">
                {m.price_cents
                  ? <span className="text-green-600">${Math.round(m.price_cents / 100).toLocaleString()}</span>
                  : <span className="text-gray-400">No price</span>}
              </td>
              <td className="px-3 py-2">
                <select
                  value={m.brand_id || ""}
                  onChange={(e) => assign(m.id, e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:outline-none"
                >
                  <option value="">— None —</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name?.trim() || b.slug || "Unnamed brand"}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
