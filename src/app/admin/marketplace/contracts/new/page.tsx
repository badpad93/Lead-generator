"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Save, AlertCircle } from "lucide-react";
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
    power_required: true,
    parking_required: false,
    min_employees: "",
    min_traffic_score: "",
    industries: [] as string[],
    notes: "",
    status: "draft" as "draft" | "open",
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/contracts/new"); return; }
      setToken(session.access_token);
    });
  }, [router]);

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
      power_required: form.power_required,
      parking_required: form.parking_required,
      min_employees: form.min_employees ? Number(form.min_employees) : null,
      min_traffic_score: form.min_traffic_score ? Number(form.min_traffic_score) : null,
      industries: form.industries,
      notes: form.notes.trim() || null,
      status: form.status,
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
  const pricing = TIERS[form.tier];

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
              <label className={labelClass}>Operator (internal reference, not shown to partners)</label>
              <input
                type="text"
                value={form.operator_business_name}
                onChange={(e) => setForm((f) => ({ ...f, operator_business_name: e.target.value }))}
                placeholder="Acme Vending LLC"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Tier + pricing */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Tier & Pricing</h3>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {([1, 2, 3] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, tier: t }))}
                className={`rounded-xl border p-3 text-left transition-colors ${form.tier === t ? "border-green-primary bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}
              >
                <p className="text-sm font-semibold text-gray-900">{tierLabel(t)}</p>
                <p className="text-xs text-gray-500">PP ${TIERS[t].partner_payout}</p>
                <p className="text-xs text-gray-500">Op ${TIERS[t].operator_price}</p>
              </button>
            ))}
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            Partner receives <span className="font-semibold text-emerald-700">${pricing.partner_payout}</span> · Operator pays <span className="font-semibold text-gray-900">${pricing.operator_price}</span> · Vending Connector keeps <span className="font-semibold text-gray-900">${pricing.platform_fee}</span>
          </div>
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
