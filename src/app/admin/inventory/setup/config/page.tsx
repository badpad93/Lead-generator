"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Settings, ChevronLeft, Save, Info } from "lucide-react";

interface Config {
  id: string;
  default_lookback_weeks: number;
  default_safety_stock_pct: number;
  default_order_cycle_days: number;
  default_forecast_method: "simple" | "weighted";
  default_weight_config: Array<{ weeks_back_from: number; weeks_back_to: number; weight: number }>;
  default_warehouse_id: string | null;
  spike_threshold_multiplier: number;
  min_valid_weeks: number;
  current_formula_version: number;
}

interface WH { id: string; name: string; code: string | null; active: boolean; }

export default function ConfigPage() {
  const [token, setToken] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [warehouses, setWarehouses] = useState<WH[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;
      setToken(session.access_token);
      const [c, w] = await Promise.all([
        fetch("/api/admin/inventory/configuration", { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch("/api/admin/inventory/warehouses", { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ]);
      if (c.ok && !cancelled) {
        const { configuration } = await c.json();
        setConfig(configuration);
      }
      if (w.ok && !cancelled) {
        const { warehouses: ws } = await w.json();
        setWarehouses(ws);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    if (!token || !config) return;
    setSaving(true);
    const body = {
      default_lookback_weeks: config.default_lookback_weeks,
      default_safety_stock_pct: config.default_safety_stock_pct,
      default_order_cycle_days: config.default_order_cycle_days,
      default_forecast_method: config.default_forecast_method,
      default_weight_config: config.default_weight_config,
      default_warehouse_id: config.default_warehouse_id,
      spike_threshold_multiplier: config.spike_threshold_multiplier,
      min_valid_weeks: config.min_valid_weeks,
    };
    const res = await fetch("/api/admin/inventory/configuration", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setToast({ tone: "success", msg: "Configuration saved" });
      setTimeout(() => setToast(null), 3000);
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({ tone: "error", msg: err.error ?? "Save failed" });
      setTimeout(() => setToast(null), 5000);
    }
  }

  function updateBucket(i: number, field: keyof Config["default_weight_config"][number], value: number) {
    if (!config) return;
    const next = [...config.default_weight_config];
    next[i] = { ...next[i], [field]: value };
    setConfig({ ...config, default_weight_config: next });
  }

  function addBucket() {
    if (!config) return;
    const last = config.default_weight_config[config.default_weight_config.length - 1];
    setConfig({
      ...config,
      default_weight_config: [
        ...config.default_weight_config,
        { weeks_back_from: (last?.weeks_back_to ?? 0) + 1, weeks_back_to: (last?.weeks_back_to ?? 0) + 4, weight: 0.1 },
      ],
    });
  }

  function removeBucket(i: number) {
    if (!config) return;
    setConfig({ ...config, default_weight_config: config.default_weight_config.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link href="/admin/inventory/setup" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ChevronLeft className="h-4 w-4" /> Setup
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Settings className="h-6 w-6 text-emerald-600" /> Forecast Configuration
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Global defaults used by every SKU that doesn&apos;t set its own override. Changes affect
        the NEXT calculation run — historical recommendations are locked to the values that were
        in place when they were computed.
      </p>

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <Loader2 className="inline h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : !config ? (
        <p className="text-sm text-red-600">Configuration row missing.</p>
      ) : (
        <div className="space-y-6">
          <Card title="Engine defaults">
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Lookback (weeks, 6-12)" value={config.default_lookback_weeks} step={1} min={6} max={12}
                onChange={(v) => setConfig({ ...config, default_lookback_weeks: v })} />
              <NumField label="Safety stock" value={config.default_safety_stock_pct * 100} step={0.5} min={0} max={100} suffix="%"
                onChange={(v) => setConfig({ ...config, default_safety_stock_pct: v / 100 })} />
              <NumField label="Order cycle (days)" value={config.default_order_cycle_days} step={1} min={1}
                onChange={(v) => setConfig({ ...config, default_order_cycle_days: v })} />
              <SelectFieldC label="Forecast method" value={config.default_forecast_method}
                onChange={(v) => setConfig({ ...config, default_forecast_method: v as "simple" | "weighted" })}>
                <option value="simple">simple</option>
                <option value="weighted">weighted</option>
              </SelectFieldC>
              <NumField label="Spike threshold" value={config.spike_threshold_multiplier} step={0.1} min={1} max={10}
                onChange={(v) => setConfig({ ...config, spike_threshold_multiplier: v })} />
              <NumField label="Min valid weeks" value={config.min_valid_weeks} step={1} min={1} max={12}
                onChange={(v) => setConfig({ ...config, min_valid_weeks: v })} />
            </div>
          </Card>

          <Card title="Default warehouse for auto-consumption">
            <SelectFieldC
              label="Warehouse coffee-order fulfillment debits from"
              value={config.default_warehouse_id ?? ""}
              onChange={(v) => setConfig({ ...config, default_warehouse_id: v || null })}
            >
              <option value="">— oldest active (auto) —</option>
              {warehouses.filter((w) => w.active).map((w) => (
                <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ""}</option>
              ))}
            </SelectFieldC>
            <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              When unset, the oldest active warehouse is used. Explicit selection is recommended once you have more than one warehouse.
            </p>
          </Card>

          <Card title="Weight buckets (weighted method only)">
            <p className="text-xs text-gray-500 mb-3">
              Each bucket covers a range of weeks (1 = most recent). Weights are relative — they don&apos;t need to sum to 1.
              Weeks outside all buckets are ignored, which lets the same config work for shorter lookbacks.
            </p>
            <table className="w-full text-sm mb-2">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="py-1">Weeks back — from</th>
                  <th className="py-1">to</th>
                  <th className="py-1">Weight</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {config.default_weight_config.map((b, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      <input type="number" min={1} value={b.weeks_back_from}
                        onChange={(e) => updateBucket(i, "weeks_back_from", Number(e.target.value))}
                        className="w-20 rounded border border-gray-200 px-2 py-1 text-sm" />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="number" min={1} value={b.weeks_back_to}
                        onChange={(e) => updateBucket(i, "weeks_back_to", Number(e.target.value))}
                        className="w-20 rounded border border-gray-200 px-2 py-1 text-sm" />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="number" step={0.05} value={b.weight}
                        onChange={(e) => updateBucket(i, "weight", Number(e.target.value))}
                        className="w-24 rounded border border-gray-200 px-2 py-1 text-sm" />
                    </td>
                    <td className="py-1 text-right">
                      <button type="button" onClick={() => removeBucket(i)} className="text-red-600 hover:underline text-xs">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={addBucket} className="text-xs text-emerald-700 hover:underline">+ Add bucket</button>
          </Card>

          <div className="text-xs text-gray-500 border-t border-gray-100 pt-4">
            Current formula version: <strong>v{config.current_formula_version}</strong>
            <br />
            Formula version is not admin-editable — bumping it is a code + math decision so historical recommendations stay reproducible.
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Configuration
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 rounded-lg shadow-lg px-4 py-3 text-sm font-medium text-white ${toast.tone === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function NumField({ label, value, onChange, step, min, max, suffix }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex items-center">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
        {suffix && <span className="ml-1 text-xs text-gray-500">{suffix}</span>}
      </div>
    </div>
  );
}

function SelectFieldC({ label, value, onChange, children }: {
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
