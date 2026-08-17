"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, CheckCircle2, AlertCircle } from "lucide-react";

interface Settings {
  platformTakeDollars: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

function formatDollars(d: number): string {
  return d.toFixed(2);
}

export default function AdminMarketplaceSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [inputDollars, setInputDollars] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/marketplace/settings");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSettings(data.settings);
        setInputDollars(formatDollars(data.settings.platformTakeDollars));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      }
      setLoading(false);
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const dollars = Number(inputDollars);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setError("Enter a non-negative dollar amount.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/marketplace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform_take: dollars }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Save failed (HTTP ${res.status})`);
      } else {
        setSettings(data.settings);
        setInputDollars(formatDollars(data.settings.platformTakeDollars));
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-gray-500 text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading settings…
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Marketplace Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Policy knobs that apply to auto-created placement contracts. Per-contract overrides still take precedence.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden max-w-2xl"
      >
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">Default Platform Take</h2>
          <p className="text-[12px] text-gray-500 mt-1">
            What VC keeps per completed location. New contracts created from <code>/request-location</code> deposits use this value as the default <code>platform_fee</code>. Reducing it increases the PP payout on future contracts.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Platform take per location (USD)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={inputDollars}
                onChange={(e) => {
                  setInputDollars(e.target.value);
                  setSaved(false);
                }}
                className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Standard operator price per location is $500. A take of $100 → PP receives $400.
            </p>
          </div>

          {settings?.updatedAt && (
            <p className="text-[11px] text-gray-400">
              Last updated {new Date(settings.updatedAt).toLocaleString()}.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {saved && (
            <div className="flex items-start gap-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Saved. New contracts will use this value.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
