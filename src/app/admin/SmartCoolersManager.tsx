"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Plus, Trash2, Upload, X, FileText, ExternalLink } from "lucide-react";

export interface AdminMachine {
  id: string;
  name: string;
  bottles: string | null;
  shelves: string | null;
  cameras: string | null;
  warranty: string | null;
  starting_at: string | null;
  active: boolean;
  sort_order: number;
  image_path: string | null;
  image_url: string | null;
  spec_path: string | null;
  spec_url: string | null;
  listing_id: string | null;
  price_cents: number | null;
}

export interface SellableListing {
  id: string;
  title: string;
  buy_now_enabled: boolean | null;
}

const TEXT_FIELDS: { key: keyof AdminMachine; label: string; placeholder: string }[] = [
  { key: "name", label: "Name", placeholder: "Summit Pro 542 AI Smart Cooler" },
  { key: "starting_at", label: "Starting at", placeholder: "$4,699" },
  { key: "bottles", label: "Bottles", placeholder: "378 bottles" },
  { key: "shelves", label: "Shelves", placeholder: "6 shelves" },
  { key: "cameras", label: "Cameras", placeholder: "2x cameras" },
  { key: "warranty", label: "Warranty", placeholder: "1 year warranty" },
];

async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export default function SmartCoolersManager({ token }: { token: string }) {
  const [machines, setMachines] = useState<AdminMachine[]>([]);
  const [listings, setListings] = useState<SellableListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [cards, sellable] = await Promise.all([
        api("/api/admin/smart-coolers/machines", token),
        api("/api/admin/vending-brands/machines", token),
      ]);
      setMachines(cards.machines || []);
      setListings(sellable.machines || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const run = async () => {
      await refresh();
    };
    run();
  }, [refresh]);

  async function addMachine() {
    setAdding(true);
    setError(null);
    try {
      await api("/api/admin/smart-coolers/machines", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New machine", active: false }),
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
        <Loader2 className="h-4 w-4 animate-spin" /> Loading machines…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Smart Coolers — machine grid</h2>
          <p className="text-sm text-gray-500">
            Edits appear on the public <span className="font-mono">/smart-coolers</span> page. Only active machines show,
            ordered by sort order.
          </p>
        </div>
        <button
          onClick={addMachine}
          disabled={adding}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add machine
        </button>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="space-y-4">
        {machines.map((m) => (
          <MachineEditor key={m.id} machine={m} token={token} listings={listings} onChanged={refresh} />
        ))}
        {machines.length === 0 && <p className="text-sm text-gray-400">No machines yet. Add one to get started.</p>}
      </div>
    </div>
  );
}

function MachineEditor({ machine, token, listings, onChanged }: { machine: AdminMachine; token: string; listings: SellableListing[]; onChanged: () => void }) {
  const [form, setForm] = useState(machine);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [priceDollars, setPriceDollars] = useState(machine.price_cents != null ? String(machine.price_cents / 100) : "");

  const set = (key: keyof AdminMachine, value: string | number | boolean | null) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    setMsg(null);
    const priceCents = priceDollars.trim() === "" ? null : Math.round(Number(priceDollars) * 100) || null;
    try {
      await api(`/api/admin/smart-coolers/machines/${machine.id}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          bottles: form.bottles,
          shelves: form.shelves,
          cameras: form.cameras,
          warranty: form.warranty,
          starting_at: form.starting_at,
          active: form.active,
          sort_order: Number(form.sort_order) || 0,
          listing_id: form.listing_id || null,
          price_cents: priceCents,
        }),
      });
      setMsg("Saved");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${form.name}"? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/smart-coolers/machines/${machine.id}`, token, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="w-full space-y-3 sm:w-44">
          <PhotoControl machine={machine} token={token} />
          <SpecControl machine={machine} token={token} />
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TEXT_FIELDS.map((f) => (
              <label key={String(f.key)} className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">{f.label}</span>
                <input
                  value={(form[f.key] as string) || ""}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
              Active (visible on page)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Sort order
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => set("sort_order", e.target.value)}
                className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700" title="Set a price to sell this machine directly with its own Buy button">
              Sale price $
              <input
                type="number"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                placeholder="6295"
                className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700" title="Alternative: point the Buy button at an existing listing (ignored when a Sale price is set)">
              Or link listing
              <select
                value={form.listing_id || ""}
                onChange={(e) => set("listing_id", e.target.value || null)}
                className="max-w-[14rem] rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:outline-none"
              >
                <option value="">— None —</option>
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}{l.buy_now_enabled ? "" : " (Buy Now off)"}
                  </option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex items-center gap-2">
              {msg && <span className="text-xs text-gray-500">{msg}</span>}
              <button onClick={remove} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhotoControl({ machine, token }: { machine: AdminMachine; token: string }) {
  const [url, setUrl] = useState<string | null>(machine.image_url);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await api(`/api/admin/smart-coolers/machines/${machine.id}/photo`, token, { method: "PUT", body: fd });
      setUrl(data.image_url || null);
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
      await api(`/api/admin/smart-coolers/machines/${machine.id}/photo`, token, { method: "DELETE" });
      setUrl(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full sm:w-44">
      <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
        {url ? (
          <Image src={url} alt={machine.name} fill unoptimized className="object-contain" />
        ) : (
          <span className="text-xs text-gray-400">No photo</span>
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
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
        </label>
        {url && (
          <button onClick={clear} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50" title="Remove photo">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

function SpecControl({ machine, token }: { machine: AdminMachine; token: string }) {
  const [url, setUrl] = useState<string | null>(machine.spec_url);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await api(`/api/admin/smart-coolers/machines/${machine.id}/spec`, token, { method: "PUT", body: fd });
      setUrl(data.spec_url || null);
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
      await api(`/api/admin/smart-coolers/machines/${machine.id}/spec`, token, { method: "DELETE" });
      setUrl(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-200 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Spec sheet (PDF/image)</span>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:underline">
          <FileText className="h-3.5 w-3.5" /> View spec <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <p className="mb-2 text-xs text-gray-400">None uploaded</p>
      )}
      <div className="flex items-center gap-2">
        <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <Upload className="h-3.5 w-3.5" /> {url ? "Replace" : "Upload"}
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
        </label>
        {url && (
          <button onClick={clear} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50" title="Remove spec">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
