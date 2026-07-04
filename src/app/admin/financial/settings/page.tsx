"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeftRight, ArrowLeft, Plus, Trash2, AlertCircle, CheckCircle2, Lock, Percent, Clock, User as UserIcon, Tag } from "lucide-react";
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

interface CommissionRule {
  id: string;
  user_id: string | null;
  role_code: string | null;
  category: string | null;
  rate_bps: number;
  hold_days: number;
  priority: number;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  user?: { id: string; full_name: string | null; email: string | null } | null;
}

export default function FinancialSettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Role UI
  const [showNewRole, setShowNewRole] = useState(false);
  const [newRole, setNewRole] = useState({ code: "", label: "", description: "", sort_order: 100 });

  // Rule UI
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRule, setNewRule] = useState({
    role_code: "",
    user_id: "",
    category: "",
    rate_pct: "",
    hold_days: "0",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const [rolesRes, rulesRes] = await Promise.all([
      fetch("/api/admin/financial/attribution-roles", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/admin/financial/commission-rules", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (rolesRes.ok) setRoles(await rolesRes.json());
    if (rulesRes.ok) setRules(await rulesRes.json());
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

  async function createRole() {
    setError(null); setMessage(null); setSaving("new-role");
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
      setShowNewRole(false);
      await load();
    }
    setSaving(null);
  }

  async function toggleRole(role: Role) {
    setSaving(role.id); setError(null);
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

  async function removeRole(role: Role) {
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

  async function createRule() {
    setError(null); setMessage(null); setSaving("new-rule");
    const ratePct = Number(newRule.rate_pct);
    if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
      setError("Rate must be a number between 0 and 100");
      setSaving(null);
      return;
    }
    const payload: Record<string, unknown> = {
      role_code: newRule.role_code || null,
      user_id: newRule.user_id.trim() || null,
      category: newRule.category.trim() || null,
      rate_bps: Math.round(ratePct * 100),
      hold_days: Number(newRule.hold_days) || 0,
      notes: newRule.notes.trim() || null,
    };
    if (!payload.role_code && !payload.user_id && !payload.category) {
      setError("Choose at least one of role / user / category. Use the default rule for the blanket rate.");
      setSaving(null);
      return;
    }
    const res = await fetch("/api/admin/financial/commission-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Create failed");
    else {
      setMessage(`Created rule at ${ratePct}% (hold ${newRule.hold_days}d)`);
      setNewRule({ role_code: "", user_id: "", category: "", rate_pct: "", hold_days: "0", notes: "" });
      setShowNewRule(false);
      await load();
    }
    setSaving(null);
  }

  async function updateRule(rule: CommissionRule, patch: Partial<CommissionRule>) {
    setSaving(rule.id); setError(null);
    const res = await fetch(`/api/admin/financial/commission-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Update failed");
    else await load();
    setSaving(null);
  }

  async function deleteRule(rule: CommissionRule) {
    if (rule.is_default) return;
    if (!confirm("Delete this rule? Existing ledger entries stay intact.")) return;
    setSaving(rule.id);
    const res = await fetch(`/api/admin/financial/commission-rules/${rule.id}`, {
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

  const defaultRule = rules.find((r) => r.is_default);
  const customRules = rules.filter((r) => !r.is_default);

  function ruleTargetLabel(rule: CommissionRule): string {
    const parts: string[] = [];
    if (rule.user_id) parts.push(`User: ${rule.user?.full_name || rule.user?.email || rule.user_id.slice(0, 8)}`);
    if (rule.role_code) parts.push(`Role: ${roles.find((r) => r.code === rule.role_code)?.label || rule.role_code}`);
    if (rule.category) parts.push(`Category: ${rule.category}`);
    return parts.length ? parts.join(" · ") : "All commissions (default)";
  }

  return (
    <div className="p-6">
      <Link href="/admin/financial" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Financial Center
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-green-primary" /> Financial Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">Attribution roles + commission rules. Auto-earn fires on paid payments; auto-reverse fires on refunds and chargebacks.</p>
      </div>

      {message && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Commission rules */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Percent className="h-4 w-4 text-green-primary" /> Commission Rules</h2>
            <p className="text-xs text-gray-500 mt-0.5">Priority: user + category → user → role + category → role → default.</p>
          </div>
          <button
            onClick={() => setShowNewRule((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> New rule
          </button>
        </div>

        {showNewRule && (
          <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Role (optional)</label>
                <select value={newRule.role_code} onChange={(e) => setNewRule((r) => ({ ...r, role_code: e.target.value }))} className={inputClass}>
                  <option value="">— any role —</option>
                  {roles.filter((r) => r.is_active).map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>User ID (optional)</label>
                <input type="text" value={newRule.user_id} onChange={(e) => setNewRule((r) => ({ ...r, user_id: e.target.value }))} className={inputClass + " font-mono"} placeholder="uuid — leave blank for all users" />
              </div>
              <div>
                <label className={labelClass}>Category (optional)</label>
                <input type="text" value={newRule.category} onChange={(e) => setNewRule((r) => ({ ...r, category: e.target.value }))} className={inputClass} placeholder="coffee, machine, service, …" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Rate (%)</label>
                <input type="number" step="0.01" min="0" max="100" value={newRule.rate_pct} onChange={(e) => setNewRule((r) => ({ ...r, rate_pct: e.target.value }))} className={inputClass} placeholder="5.0" />
              </div>
              <div>
                <label className={labelClass}>Hold (days)</label>
                <input type="number" min="0" max="365" value={newRule.hold_days} onChange={(e) => setNewRule((r) => ({ ...r, hold_days: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Notes</label>
                <input type="text" value={newRule.notes} onChange={(e) => setNewRule((r) => ({ ...r, notes: e.target.value }))} className={inputClass} placeholder="Why this override exists" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewRule(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button
                onClick={createRule}
                disabled={saving === "new-rule" || !newRule.rate_pct}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-4 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {saving === "new-rule" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Create rule
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : (
          <div className="space-y-2">
            {defaultRule && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    Default rate
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      <Lock className="h-2.5 w-2.5" /> system
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Applies when no more-specific rule matches.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Rate %</label>
                  <input
                    type="number" step="0.01" min="0" max="100"
                    defaultValue={(defaultRule.rate_bps / 100).toFixed(2)}
                    onBlur={(e) => {
                      const pct = Number(e.target.value);
                      if (Number.isFinite(pct) && pct >= 0 && pct <= 100 && Math.round(pct * 100) !== defaultRule.rate_bps) {
                        updateRule(defaultRule, { rate_bps: Math.round(pct * 100) });
                      }
                    }}
                    className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                  />
                  <label className="text-xs text-gray-500 ml-2">Hold</label>
                  <input
                    type="number" min="0" max="365"
                    defaultValue={defaultRule.hold_days}
                    onBlur={(e) => {
                      const d = Number(e.target.value);
                      if (Number.isFinite(d) && d >= 0 && d <= 365 && d !== defaultRule.hold_days) {
                        updateRule(defaultRule, { hold_days: d });
                      }
                    }}
                    className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                  />
                  <span className="text-xs text-gray-400">d</span>
                </div>
              </div>
            )}
            {customRules.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No overrides yet. Add one to give a role, user, or category a different rate.</p>
            ) : (
              customRules.map((rule) => (
                <div key={rule.id} className="rounded-xl border border-gray-100 bg-white p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${rule.is_active ? "text-gray-900" : "text-gray-400 line-through"}`}>
                      {ruleTargetLabel(rule)}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span className="inline-flex items-center gap-0.5"><Percent className="h-3 w-3" />{(rule.rate_bps / 100).toFixed(2)}%</span>
                      <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" />{rule.hold_days}d hold</span>
                      <span className="text-gray-400">priority {rule.priority}</span>
                      {rule.notes && <span className="italic truncate">{rule.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateRule(rule, { is_active: !rule.is_active })}
                      disabled={saving === rule.id}
                      className="rounded-lg border border-gray-200 hover:bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 cursor-pointer disabled:opacity-50"
                    >
                      {rule.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => deleteRule(rule)}
                      disabled={saving === rule.id}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer disabled:opacity-50"
                      title="Delete rule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Attribution roles */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><UserIcon className="h-4 w-4 text-green-primary" /> Attribution Roles</h2>
            <p className="text-xs text-gray-500 mt-0.5">Configurable roles for sales credit. System roles can be renamed but not deactivated.</p>
          </div>
          <button
            onClick={() => setShowNewRole((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> New role
          </button>
        </div>

        {showNewRole && (
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
              <button onClick={() => setShowNewRole(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button
                onClick={createRole}
                disabled={saving === "new-role" || !newRole.label.trim() || !newRole.code.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-4 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {saving === "new-role" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Create role
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
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
                      onClick={() => toggleRole(role)}
                      disabled={saving === role.id}
                      className="rounded-lg border border-gray-200 hover:bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 cursor-pointer disabled:opacity-50"
                    >
                      {role.is_active ? "Deactivate" : "Activate"}
                    </button>
                  )}
                  {!role.is_system && role.is_active && (
                    <button
                      onClick={() => removeRole(role)}
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
        <p className="text-sm font-semibold text-amber-900">Ships in Phase 5+</p>
        <p className="text-xs text-amber-700 mt-1">Reconciliation window controls and reminder cadence editors land next. Categories inherit from <code>sales_orders.order_type</code> today.</p>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
        <Tag className="h-3 w-3" /> Inspector: <Link href="/admin/financial/commissions" className="text-green-primary hover:underline">Commission Ledger</Link>
      </div>
    </div>
  );
}
