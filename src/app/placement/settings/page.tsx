"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Bell, CheckCircle2, AlertCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Prefs {
  partner_contract_opened: boolean;
  partner_submission_reviewed: boolean;
  partner_operator_decided: boolean;
  partner_payout_sent: boolean;
}

const EVENTS: Array<{ key: keyof Prefs; label: string; description: string }> = [
  {
    key: "partner_contract_opened",
    label: "New contracts",
    description: "Email me when a contract that matches my territory + industries opens.",
  },
  {
    key: "partner_submission_reviewed",
    label: "Submission review updates",
    description: "Email me when admin requests changes or rejects a submission.",
  },
  {
    key: "partner_operator_decided",
    label: "Operator decisions",
    description: "Email me when the operator accepts or rejects a submission.",
  },
  {
    key: "partner_payout_sent",
    label: "Payout confirmations",
    description: "Email me when a payout is queued for QuickBooks.",
  },
];

function defaultPrefs(saved: Partial<Prefs>): Prefs {
  return {
    partner_contract_opened: saved.partner_contract_opened !== false,
    partner_submission_reviewed: saved.partner_submission_reviewed !== false,
    partner_operator_decided: saved.partner_operator_decided !== false,
    partner_payout_sent: saved.partner_payout_sent !== false,
  };
}

export default function PlacementSettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs({}));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/marketplace/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setPrefs(defaultPrefs(data.notification_preferences || {}));
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/placement/settings"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setError(null);
    setMessage(null);
    setSaving(true);
    const res = await fetch("/api/marketplace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notification_preferences: prefs }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Failed");
    else setMessage("Preferences saved");
    setSaving(false);
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/placement" className="text-sm text-gray-500 hover:text-green-primary flex items-center gap-1.5 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell className="h-6 w-6 text-green-primary" /> Notification Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">Choose which marketplace emails you want to receive.</p>
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

      <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
        {EVENTS.map((e) => (
          <label key={e.key} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs[e.key]}
              onChange={(ev) => setPrefs((p) => ({ ...p, [e.key]: ev.target.checked }))}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">{e.label}</p>
              <p className="text-xs text-gray-500">{e.description}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-2.5 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save Preferences
        </button>
      </div>
    </div>
  );
}
