"use client";

import { useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

interface Props {
  token: string;
  initial: {
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  onComplete: () => void;
}

export default function OperatorOnboarding({ token, initial, onComplete }: Props) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.address.trim() || !form.city.trim() || !form.state.trim() || !form.zip.trim()) {
      setError("All fields are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save. Please try again.");
        setSaving(false);
        return;
      }
      onComplete();
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12 bg-light">
      <div className="w-full max-w-xl rounded-2xl border border-green-100 bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-primary">
            <MapPin className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-black-primary">Complete your operator profile</h1>
            <p className="text-sm text-black-primary/60">
              As an operator, your service area is shown publicly so locations can find you.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <Field label="Street Address" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
            <Field label="State" value={form.state} maxLength={2} uppercase onChange={(v) => setForm((f) => ({ ...f, state: v.toUpperCase() }))} />
          </div>
          <Field label="ZIP Code" value={form.zip} onChange={(v) => setForm((f) => ({ ...f, zip: v }))} />

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving...</span>
            ) : (
              "Save & Continue"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
  uppercase,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  uppercase?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-black-primary">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-black-primary outline-none transition-colors focus:border-green-primary focus:ring-2 focus:ring-green-100 ${uppercase ? "uppercase" : ""}`}
        required
      />
    </label>
  );
}
