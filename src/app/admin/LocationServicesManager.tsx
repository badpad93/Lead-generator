"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Plus, Trash2, Upload, X, Users } from "lucide-react";

export interface AdminLocator {
  id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  region: string | null;
  email: string | null;
  phone: string | null;
  hourly_rate_cents: number | null;
  active: boolean;
  sort_order: number;
  headshot_path: string | null;
  headshot_url: string | null;
}

interface Subscription {
  id: string;
  locator_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  hours_per_week: number;
  weekly_amount_cents: number;
  status: string;
  invoices_count: number | null;
  next_bill_at: string | null;
  created_at: string;
}

const money = (cents: number | null | undefined) => `$${Math.round((cents || 0) / 100).toLocaleString()}`;

async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export default function LocationServicesManager({ token }: { token: string }) {
  const [locators, setLocators] = useState<AdminLocator[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [l, s] = await Promise.all([
        api("/api/admin/location-services/locators", token),
        api("/api/admin/location-services/subscriptions", token),
      ]);
      setLocators(l.locators || []);
      setSubs(s.subscriptions || []);
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

  async function addLocator() {
    setAdding(true);
    setError(null);
    try {
      await api("/api/admin/location-services/locators", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New locator", active: false }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Location Services — Locators</h2>
            <p className="text-sm text-gray-500">Profiles shown on <span className="font-mono">/locators</span>. Set an hourly rate; customers pick hours/week (multiples of 5, min 15).</p>
          </div>
          <button onClick={addLocator} disabled={adding}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add locator
          </button>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {locators.map((l) => <LocatorEditor key={l.id} locator={l} token={token} onChanged={refresh} />)}
        {locators.length === 0 && <p className="text-sm text-gray-400">No locators yet. Add one to get started.</p>}
      </div>

      <SubscriptionsTable subs={subs} token={token} onChanged={refresh} />
    </div>
  );
}

const TEXT_FIELDS: { key: keyof AdminLocator; label: string; placeholder: string }[] = [
  { key: "name", label: "Name", placeholder: "Jordan Michaels" },
  { key: "headline", label: "Headline", placeholder: "Senior Placement Specialist" },
  { key: "region", label: "Region / specialties", placeholder: "Southeast US · offices & gyms" },
  { key: "email", label: "Contact email", placeholder: "jordan@…" },
  { key: "phone", label: "Phone", placeholder: "(555) 123-4567" },
];

function initialForm(l: AdminLocator) {
  return {
    name: l.name || "", headline: l.headline || "", region: l.region || "",
    email: l.email || "", phone: l.phone || "", bio: l.bio || "",
    rate: l.hourly_rate_cents ? String(Math.round(l.hourly_rate_cents / 100)) : "",
    active: l.active, sort_order: l.sort_order,
  };
}

function LocatorEditor({ locator, token, onChanged }: { locator: AdminLocator; token: string; onChanged: () => void }) {
  const [form, setForm] = useState(() => initialForm(locator));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const set = (k: string, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await api(`/api/admin/location-services/locators/${locator.id}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, headline: form.headline, region: form.region, email: form.email, phone: form.phone,
          bio: form.bio, hourly_rate_cents: Math.round((Number(form.rate) || 0) * 100),
          active: form.active, sort_order: Number(form.sort_order) || 0,
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
    if (!confirm(`Delete "${form.name}"?`)) return;
    try {
      await api(`/api/admin/location-services/locators/${locator.id}`, token, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <HeadshotControl locator={locator} token={token} />
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TEXT_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">{f.label}</span>
                <input value={String(form[f.key as keyof typeof form] ?? "")} placeholder={f.placeholder}
                  onChange={(e) => set(f.key as string, e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
              </label>
            ))}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Hourly rate ($)</span>
              <input type="number" value={form.rate} placeholder="50" onChange={(e) => set("rate", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Bio</span>
            <textarea value={form.bio} rows={2} onChange={(e) => set("bio", e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Sort
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

function HeadshotControl({ locator, token }: { locator: AdminLocator; token: string }) {
  const [url, setUrl] = useState<string | null>(locator.headshot_url);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await api(`/api/admin/location-services/locators/${locator.id}/headshot`, token, { method: "PUT", body: fd });
      setUrl(data.headshot_url || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await api(`/api/admin/location-services/locators/${locator.id}/headshot`, token, { method: "DELETE" });
      setUrl(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full sm:w-36">
      <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
        {url ? <Image src={url} alt={locator.name} fill unoptimized className="object-cover" /> : <span className="text-xs text-gray-400">No photo</span>}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <Upload className="h-3.5 w-3.5" /> {url ? "Replace" : "Upload"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ""; }} />
        </label>
        {url && <button onClick={clear} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50" title="Remove"><X className="h-3.5 w-3.5" /></button>}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

function SubscriptionsTable({ subs, token, onChanged }: { subs: Subscription[]; token: string; onChanged: () => void }) {
  const [err, setErr] = useState<string | null>(null);

  async function cancel(id: string) {
    if (!confirm("Cancel this subscription? Weekly billing will stop.")) return;
    try {
      await api("/api/admin/location-services/subscriptions", token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: id }),
      });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Cancel failed");
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-base font-bold text-gray-900">Subscriptions</h3>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
      {subs.length === 0 ? (
        <p className="text-sm text-gray-400">No subscriptions yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Locator</th>
                <th className="px-3 py-2">Hrs/wk</th>
                <th className="px-3 py-2">Weekly</th>
                <th className="px-3 py-2">Weeks</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subs.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 text-gray-800">{s.full_name || "—"}<br /><span className="text-xs text-gray-400">{s.email}{s.phone ? ` · ${s.phone}` : ""}</span></td>
                  <td className="px-3 py-2 text-gray-600">{s.locator_name || "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{s.hours_per_week}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{money(s.weekly_amount_cents)}</td>
                  <td className="px-3 py-2 text-gray-500">{s.invoices_count ?? 0}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${s.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{s.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {s.status === "active" && (
                      <button onClick={() => cancel(s.id)} className="text-xs font-medium text-red-600 hover:underline">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="flex items-center gap-1 text-xs text-gray-400"><Users className="h-3.5 w-3.5" /> Cancelling stops future weekly charges. Unpaid weeks auto-cancel and notify everyone.</p>
    </div>
  );
}
