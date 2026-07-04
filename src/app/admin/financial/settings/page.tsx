"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeftRight, ArrowLeft, Plus, Trash2, AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Role {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
}

export default function FinancialSettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newRole, setNewRole] = useState({ code: "", label: "", description: "", sort_order: 100 });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/admin/financial/attribution-roles", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setRoles(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/financial/settings"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    setError(null);
    setMessage(null);
    setSaving("new");
    const res = await fetch("/api/admin/financial/attribution-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(newRole),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Create failed");
    else {
      setMessage(`Created role "${body.label}"`);
      setNewRole({ code: "", label: "", description: "", sort_order: 100 });
      setShowNew(false);
      await load();
    }
    setSaving(null);
  }

  async function toggle(role: Role) {
    setSaving(role.id);
    setError(null);
    const res = await fetch(`/api/admin/financial/attribution-roles/${role.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_active: !role.is_active }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Update failed");
    else await load();
    setSaving(null);
  }

  async function remove(role: Role) {
    if (!confirm(`Deactivate role "${role.label}"?`)) return;
    setSaving(role.id);
    const res = await fetch(`/api/admin/financial/attribution-roles/${role.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Delete failed");
    else await load();
    setSaving(null);
  }

  const inputClass = "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none";
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="p-6">
      <Link href="/admin/financial" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Financial Center
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-green-primary" /> Financial Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">Attribution roles today. Commission rules, categories, and reminder schedule ship in Phase 4.</p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Attribution Roles</h2>
            <p className="text-xs text-gray-500 mt-0.5">Configurable roles for sales credit. System roles can be renamed but not deactivated.</p>
          </div>
          <button
            onClick={() => setShowNew((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> New role
          </button>
        </div>

        {message && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {showNew && (
          <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Label *</label>
                <input type="text" value={newRole.label} onChange={(e) => setNewRole((r) => ({ ...r, label: e.target.value }))} className={inputClass} placeholder="Solution Engineer" />
              </div>
              <div>
                <label className={labelClass}>Code (machine key) *</label>
                <input type="text" value={newRole.code} onChange={(e) => setNewRole((r) => ({ ...r, code: e.target.value }))} className={inputClass + " font-mono"} placeholder="solution_engineer" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <input type="text" value={newRole.description} onChange={(e) => setNewRole((r) => ({ ...r, description: e.target.value }))} className={inputClass} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowNew(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                Cancel
              </button>
              <button
                onClick={create}
                disabled={saving === "new" || !newRole.label.trim() || !newRole.code.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-4 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {saving === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Create role
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : roles.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No roles yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {roles.map((role) => (
              <li key={role.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${role.is_active ? "text-gray-900" : "text-gray-400 line-through"}`}>{role.label}</p>
                    <span className="text-xs font-mono text-gray-400">{role.code}</span>
                    {role.is_system && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                        <Lock className="h-2.5 w-2.5" /> system
                      </span>
                    )}
                  </div>
                  {role.description && <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {!role.is_system && (
                    <button
                      onClick={() => toggle(role)}
                      disabled={saving === role.id}
                      className="rounded-lg border border-gray-200 hover:bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 cursor-pointer disabled:opacity-50"
                    >
                      {role.is_active ? "Deactivate" : "Activate"}
                    </button>
                  )}
                  {!role.is_system && role.is_active && (
                    <button
                      onClick={() => remove(role)}
                      disabled={saving === role.id}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-semibold text-amber-900">Ships in Phase 4</p>
        <p className="text-xs text-amber-700 mt-1">Commission rules (default %, per-user overrides, category rates, hold periods), reminder cadence, and reconciliation window will all live here.</p>
      </div>
    </div>
  );
}
