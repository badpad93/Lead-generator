"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Warehouse, ChevronLeft, Plus, Pencil, X } from "lucide-react";

interface WH {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
}

export default function WarehousesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<WH[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<WH | null>(null);
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
      const res = await fetch("/api/admin/inventory/warehouses", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok && !cancelled) {
        const { warehouses } = await res.json();
        setRows(warehouses);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, reloadKey]);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link href="/admin/inventory/setup" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ChevronLeft className="h-4 w-4" /> Setup
      </Link>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Warehouse className="h-6 w-6 text-emerald-600" /> Warehouses
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Physical locations. Deactivate rather than delete — ledger transactions FK-reference these rows.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> New Warehouse
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <Loader2 className="inline h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No warehouses yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{w.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{w.code ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-md truncate">{w.address ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${w.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {w.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(w)}
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
        <Modal
          token={token}
          row={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); reload(); }}
        />
      )}
    </div>
  );
}

function Modal({
  token,
  row,
  onClose,
  onSaved,
}: {
  token: string;
  row: WH | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [code, setCode] = useState(row?.code ?? "");
  const [address, setAddress] = useState(row?.address ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [active, setActive] = useState(row?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const body = { name, code: code || null, address: address || null, notes: notes || null, active };
    const url = row
      ? `/api/admin/inventory/warehouses/${row.id}`
      : "/api/admin/inventory/warehouses";
    const method = row ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{row ? "Edit warehouse" : "New warehouse"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Name" value={name} onChange={setName} required />
          <Field label="Code" value={code} onChange={setCode} placeholder="e.g. WH-01" />
          <Field label="Address" value={address} onChange={setAddress} />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2">Cancel</button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !name.trim()}
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

function Field({ label, value, onChange, required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
    </div>
  );
}
