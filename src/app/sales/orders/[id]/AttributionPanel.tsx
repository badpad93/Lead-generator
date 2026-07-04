"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Users, Lock, Plus, Trash2, AlertCircle, CheckCircle2, PenSquare } from "lucide-react";

interface AttributionRow {
  id: string;
  user_id: string;
  role_code: string;
  percentage: number;
  notes: string | null;
  locked_at: string | null;
  locked_by_event: string | null;
  is_legacy_backfill: boolean;
  user_name?: string | null;
  user_email?: string | null;
}

interface AttributionData {
  rows: AttributionRow[];
  locked: boolean;
  can_edit: boolean;
  is_admin_editor: boolean;
  total_percentage: number;
}

interface Role {
  code: string;
  label: string;
  description?: string | null;
  is_active: boolean;
}

interface RepOption {
  id: string;
  full_name: string;
  email: string;
}

interface DraftRow {
  user_id: string;
  role_code: string;
  percentage: number;
  notes: string;
}

interface Props {
  orderId: string;
  token: string;
}

export default function AttributionPanel({ orderId, token }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AttributionData | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [reps, setReps] = useState<RepOption[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftRow[]>([]);
  const [changeReason, setChangeReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [attribRes, rolesRes, repsRes] = await Promise.all([
      fetch(`/api/sales/orders/${orderId}/attributions`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/attribution-roles", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      fetch("/api/sales/users", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (attribRes.ok) setData(await attribRes.json());
    if (rolesRes && rolesRes.ok) setRoles(await rolesRes.json());
    if (repsRes.ok) setReps(await repsRes.json());
    setLoading(false);
  }, [orderId, token]);

  useEffect(() => { load(); }, [load]);

  function startEditing() {
    if (!data) return;
    setDraft(data.rows.map((r) => ({
      user_id: r.user_id,
      role_code: r.role_code,
      percentage: Number(r.percentage),
      notes: r.notes || "",
    })));
    setChangeReason("");
    setError(null);
    setEditing(true);
  }

  function addRow() {
    setDraft((d) => [...d, { user_id: reps[0]?.id || "", role_code: roles[0]?.code || "lead_owner", percentage: 0, notes: "" }]);
  }
  function removeRow(idx: number) {
    setDraft((d) => d.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<DraftRow>) {
    setDraft((d) => d.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const draftTotal = draft.reduce((sum, r) => sum + Number(r.percentage || 0), 0);
  const withinTolerance = Math.abs(draftTotal - 100) < 0.001;

  async function save() {
    if (!withinTolerance) { setError(`Percentages must sum to 100 (currently ${draftTotal.toFixed(2)})`); return; }
    if (data?.locked && data?.is_admin_editor && !changeReason.trim()) {
      setError("Change reason required to modify locked attribution.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/sales/orders/${orderId}/attributions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rows: draft, change_reason: changeReason || null }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Failed to save");
    else {
      setEditing(false);
      await load();
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading attribution…</div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Sales Attribution</h3>
          {data.locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Lock className="h-3 w-3" /> Locked
            </span>
          )}
        </div>
        {!editing && data.can_edit && (
          <button
            onClick={startEditing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 cursor-pointer"
          >
            <PenSquare className="h-3.5 w-3.5" /> Edit
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!editing ? (
        <div className="space-y-2">
          {data.rows.length === 0 ? (
            <p className="text-xs text-gray-500">No credited users. The system-assigned rep receives implicit 100% Lead Owner credit until set explicitly.</p>
          ) : (
            data.rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-2.5 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{r.user_name || r.user_email || r.user_id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500 capitalize">{r.role_code.replace(/_/g, " ")}{r.is_legacy_backfill && " · legacy backfill"}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-emerald-700">{Number(r.percentage).toFixed(1)}%</p>
                </div>
              </div>
            ))
          )}
          <div className="flex items-center justify-between pt-1 text-xs text-gray-500 border-t border-gray-100">
            <span>Total</span>
            <span className={data.total_percentage === 100 ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
              {data.total_percentage.toFixed(1)}%
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {draft.map((r, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_100px_40px] gap-2 items-center rounded-lg border border-gray-100 p-2">
              <select value={r.user_id} onChange={(e) => updateRow(i, { user_id: e.target.value })} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
                {reps.map((rep) => <option key={rep.id} value={rep.id}>{rep.full_name || rep.email}</option>)}
              </select>
              <select value={r.role_code} onChange={(e) => updateRow(i, { role_code: e.target.value })} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
                {roles.filter((role) => role.is_active).map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}
              </select>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={r.percentage}
                onChange={(e) => updateRow(i, { percentage: Number(e.target.value) || 0 })}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-right"
              />
              <button onClick={() => removeRow(i)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={addRow}
            className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:bg-gray-50 cursor-pointer inline-flex items-center justify-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add credit
          </button>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100">
            <span className="text-gray-500">Total</span>
            <span className={withinTolerance ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>
              {draftTotal.toFixed(1)}% {withinTolerance ? <CheckCircle2 className="inline h-3 w-3" /> : "(must be 100%)"}
            </span>
          </div>

          {data.locked && data.is_admin_editor && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Change reason (required for locked orders)</label>
              <textarea
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                rows={2}
                placeholder="Why is this attribution being adjusted after lock?"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none resize-none"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !withinTolerance}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-4 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save Attribution
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
