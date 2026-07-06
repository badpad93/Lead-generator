"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Save, AlertCircle, Search, X, User as UserIcon } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { INDUSTRIES } from "@/app/placement/industries";
import { US_STATES } from "@/lib/types";
import { TIERS, tierLabel } from "@/lib/marketplacePricing";

export default function AdminNewContractPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    tier: 1 as 1 | 2 | 3,
    machine_type: "VendEra AI Machine",
    market_state: "",
    market_city: "",
    contract_type: "multi" as "single" | "multi" | "city" | "state" | "recurring",
    locations_needed: 1,
    deadline_at: "",
    operator_business_name: "",
    operator_profile_id: "" as string | "",
    power_required: true,
    parking_required: false,
    min_employees: "",
    min_traffic_score: "",
    industries: [] as string[],
    notes: "",
    status: "open" as "draft" | "open",
    // Pricing — starts from tier defaults but the admin can override each.
    operator_price: String(TIERS[1].operator_price),
    partner_payout: String(TIERS[1].partner_payout),
    platform_fee: String(TIERS[1].platform_fee),
    custom_pricing: false,
  });

  // Operator picker
  interface OperatorHit { id: string; full_name: string | null; email: string | null; company_name: string | null; city: string | null; state: string | null }
  const [opQuery, setOpQuery] = useState("");
  const [opResults, setOpResults] = useState<OperatorHit[]>([]);
  const [opSearching, setOpSearching] = useState(false);
  const [opSelected, setOpSelected] = useState<OperatorHit | null>(null);
  const [opOpen, setOpOpen] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/contracts/new"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  // Debounced operator search
  useEffect(() => {
    if (!token || !opOpen) return;
    const timer = setTimeout(async () => {
      setOpSearching(true);
      const res = await fetch(`/api/admin/marketplace/operators?q=${encodeURIComponent(opQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setOpResults(await res.json());
      setOpSearching(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [opQuery, token, opOpen]);

  function selectOperator(op: OperatorHit) {
    setOpSelected(op);
    setForm((f) => ({
      ...f,
      operator_profile_id: op.id,
      operator_business_name: op.company_name || op.full_name || "",
    }));
    setOpOpen(false);
    setOpQuery("");
  }

  function clearOperator() {
    setOpSelected(null);
    setForm((f) => ({ ...f, operator_profile_id: "", operator_business_name: "" }));
  }

  function toggleIndustry(name: string) {
    setForm((f) => ({
      ...f,
      industries: f.industries.includes(name) ? f.industries.filter((n) => n !== name) : [...f.industries, name],
    }));
  }

  async function save() {
    setError(null);
    if (!form.title.trim()) { setError("Title required"); return; }
    setSaving(true);
    const opN = Number(form.operator_price);
    const ppN = Number(form.partner_payout);
    const pfN = Number(form.platform_fee);
    if (!Number.isFinite(opN) || opN <= 0) { setError("Operator price must be greater than 0"); setSaving(false); return; }
    if (!Number.isFinite(ppN) || ppN < 0) { setError("Partner payout must be 0 or greater"); setSaving(false); return; }
    if (!Number.isFinite(pfN) || pfN < 0) { setError("Company payout must be 0 or greater"); setSaving(false); return; }

    const payload = {
      title: form.title.trim(),
      tier: form.tier,
      machine_type: form.machine_type,
      market_state: form.market_state || null,
      market_city: form.market_city.trim() || null,
      contract_type: form.contract_type,
      locations_needed: Number(form.locations_needed) || 1,
      deadline_at: form.deadline_at || null,
      operator_business_name: form.operator_business_name.trim() || null,
      operator_profile_id: form.operator_profile_id || null,
      power_required: form.power_required,
      parking_required: form.parking_required,
      min_employees: form.min_employees ? Number(form.min_employees) : null,
      min_traffic_score: form.min_traffic_score ? Number(form.min_traffic_score) : null,
      industries: form.industries,
      notes: form.notes.trim() || null,
      status: form.status,
      operator_price: opN,
      partner_payout: ppN,
      platform_fee: pfN,
    };
    const res = await fetch("/api/admin/marketplace/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Failed to create contract");
      setSaving(false);
      return;
    }
    router.push(`/admin/marketplace/contracts/${body.id}`);
  }

  const inputClass = "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none";
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="p-6 max-w-3xl">
      <Link href="/admin/marketplace/contracts" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Contracts
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">New Contract</h1>
      <p className="text-sm text-gray-500 mb-6">Package location work and offer it to partners. Save as draft or publish directly.</p>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Basics */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Contract</h3>
          <div className="grid gap-3">
            <div>
              <label className={labelClass}>Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="3 warehouses in Denver metro"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Notes (visible to partners)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Context, priorities, or hints for the sales pitch…"
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label className={labelClass}>Attach to Operator Account</label>
              <p className="text-[11px] text-gray-500 mb-2">The operator sees this contract on <code>/operator/contracts</code>, can review submitted locations, get billed for accepted ones, and receive notifications. Not shown to partners.</p>
              {opSelected ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserIcon className="h-4 w-4 text-emerald-700 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-emerald-900 truncate">{opSelected.company_name || opSelected.full_name}</p>
                      <p className="text-xs text-emerald-700 truncate">{opSelected.email}{opSelected.city ? ` · ${opSelected.city}${opSelected.state ? `, ${opSelected.state}` : ""}` : ""}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearOperator}
                    className="text-emerald-700 hover:text-emerald-900 shrink-0"
                    title="Detach"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 focus-within:border-green-primary">
                    <Search className="h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={opQuery}
                      onFocus={() => setOpOpen(true)}
                      onChange={(e) => { setOpQuery(e.target.value); setOpOpen(true); }}
                      placeholder="Search by name, email, or company…"
                      className="flex-1 text-sm outline-none"
                    />
                    {opSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                  </div>
                  {opOpen && (opResults.length > 0 || opQuery.length > 0) && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg max-h-64 overflow-y-auto">
                      {opResults.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-500">No operators match. Users must have <code>role=&apos;operator&apos;</code> to show here.</p>
                      ) : (
                        opResults.map((op) => (
                          <button
                            key={op.id}
                            type="button"
                            onClick={() => selectOperator(op)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-50 last:border-b-0"
                          >
                            <p className="font-medium text-gray-900">{op.company_name || op.full_name}</p>
                            <p className="text-gray-500">{op.email}{op.city ? ` · ${op.city}${op.state ? `, ${op.state}` : ""}` : ""}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Free-text fallback in case the operator has no profile yet — kept but de-emphasized */}
              {!opSelected && (
                <details className="mt-2">
                  <summary className="text-[11px] text-gray-400 cursor-pointer">Operator has no account yet? Enter a business name manually</summary>
                  <input
                    type="text"
                    value={form.operator_business_name}
                    onChange={(e) => setForm((f) => ({ ...f, operator_business_name: e.target.value }))}
                    placeholder="Acme Vending LLC"
                    className={inputClass + " mt-1"}
                  />
                  <p className="text-[10px] text-amber-700 mt-1">Without an attached operator account, no one can see this contract on the operator side. Prefer attaching to a real account.</p>
                </details>
              )}
            </div>
          </div>
        </div>

        {/* Tier + pricing */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Tier &amp; Pricing</h3>
            <p className="text-[11px] text-gray-500">Pick a tier to load defaults, then edit any field.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {([1, 2, 3] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({
                  ...f,
                  tier: t,
                  operator_price: String(TIERS[t].operator_price),
                  partner_payout: String(TIERS[t].partner_payout),
                  platform_fee: String(TIERS[t].platform_fee),
                  custom_pricing: false,
                }))}
                className={`rounded-xl border p-3 text-left transition-colors ${form.tier === t ? "border-green-primary bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}
              >
                <p className="text-sm font-semibold text-gray-900">{tierLabel(t)}</p>
                <p className="text-xs text-gray-500">PP ${TIERS[t].partner_payout}</p>
                <p className="text-xs text-gray-500">Op ${TIERS[t].operator_price}</p>
              </button>
            ))}
          </div>

          {/* Editable pricing */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Operator pays (invoice) $</label>
              <input
                type="number" min="0" step="0.01"
                value={form.operator_price}
                onChange={(e) => setForm((f) => ({ ...f, operator_price: e.target.value, custom_pricing: true }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Payout to Placement Provider $</label>
              <input
                type="number" min="0" step="0.01"
                value={form.partner_payout}
                onChange={(e) => setForm((f) => ({ ...f, partner_payout: e.target.value, custom_pricing: true }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Payout to Vending Connector $</label>
              <input
                type="number" min="0" step="0.01"
                value={form.platform_fee}
                onChange={(e) => setForm((f) => ({ ...f, platform_fee: e.target.value, custom_pricing: true }))}
                className={inputClass}
              />
            </div>
          </div>

          {/* Live sum check */}
          {(() => {
            const op = Number(form.operator_price) || 0;
            const pp = Number(form.partner_payout) || 0;
            const pf = Number(form.platform_fee) || 0;
            const sum = pp + pf;
            const delta = op - sum;
            const balanced = Math.abs(delta) < 0.01;
            return (
              <div className={`mt-3 rounded-lg p-3 text-xs ${balanced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                Operator ${op.toFixed(2)} = Partner ${pp.toFixed(2)} + Company ${pf.toFixed(2)} ({sum.toFixed(2)})
                {!balanced && (
                  <span className="ml-2 font-medium">
                    · off by ${Math.abs(delta).toFixed(2)} — {delta > 0 ? "operator overpays" : "payouts exceed collected"}
                  </span>
                )}
              </div>
            );
          })()}
        </div>

        {/* Market */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Market</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClass}>State</label>
              <select
                value={form.market_state}
                onChange={(e) => setForm((f) => ({ ...f, market_state: e.target.value }))}
                className={inputClass}
              >
                <option value="">Any</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input
                type="text"
                value={form.market_city}
                onChange={(e) => setForm((f) => ({ ...f, market_city: e.target.value }))}
                placeholder="Optional — leave blank for state-wide"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Machine Type</label>
              <input
                type="text"
                value={form.machine_type}
                onChange={(e) => setForm((f) => ({ ...f, machine_type: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Contract Type</label>
              <select
                value={form.contract_type}
                onChange={(e) => setForm((f) => ({ ...f, contract_type: e.target.value as typeof form.contract_type }))}
                className={inputClass}
              >
                <option value="single">Single location</option>
                <option value="multi">Multi location</option>
                <option value="city">City-wide</option>
                <option value="state">State-wide</option>
                <option value="recurring">Recurring</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scope */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Scope</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Locations Needed</label>
              <input
                type="number"
                min="1"
                value={form.locations_needed}
                onChange={(e) => setForm((f) => ({ ...f, locations_needed: Number(e.target.value) || 1 }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Deadline</label>
              <input
                type="date"
                value={form.deadline_at}
                onChange={(e) => setForm((f) => ({ ...f, deadline_at: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Requirements */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Requirements</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClass}>Min Employees / Traffic</label>
              <input
                type="number"
                min="0"
                value={form.min_employees}
                onChange={(e) => setForm((f) => ({ ...f, min_employees: e.target.value }))}
                placeholder="e.g. 100"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Min Traffic Score</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.min_traffic_score}
                onChange={(e) => setForm((f) => ({ ...f, min_traffic_score: e.target.value }))}
                placeholder="0-100"
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.power_required}
                onChange={(e) => setForm((f) => ({ ...f, power_required: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              Power required
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.parking_required}
                onChange={(e) => setForm((f) => ({ ...f, parking_required: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              Parking required
            </label>
          </div>
          <label className={labelClass}>Target Industries (partner must overlap)</label>
          <div className="flex flex-wrap gap-1.5">
            {INDUSTRIES.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleIndustry(i)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${form.industries.includes(i) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        {/* Publish */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Publish</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, status: "draft" }))}
              className={`flex-1 rounded-xl border p-3 text-left transition-colors ${form.status === "draft" ? "border-green-primary bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}
            >
              <p className="text-sm font-semibold text-gray-900">Save as Draft</p>
              <p className="text-xs text-gray-500">Not visible to partners yet</p>
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, status: "open" }))}
              className={`flex-1 rounded-xl border p-3 text-left transition-colors ${form.status === "open" ? "border-green-primary bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}
            >
              <p className="text-sm font-semibold text-gray-900">Publish Open</p>
              <p className="text-xs text-gray-500">Immediately available to eligible partners</p>
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Link
            href="/admin/marketplace/contracts"
            className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </Link>
          <button
            onClick={save}
            disabled={saving || !form.title.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-3 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Create Contract
          </button>
        </div>
      </div>
    </div>
  );
}
