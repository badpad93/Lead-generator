"use client";

import { useState } from "react";
import { Loader2, ArrowRight, Minus, Plus } from "lucide-react";

// Mirrors HOURS_MIN / HOURS_STEP / HOURS_MAX in locationServices.ts.
const HOURS_MIN = 15;
const HOURS_STEP = 5;
const HOURS_MAX = 40;

const money = (n: number) => `$${n.toLocaleString()}`;

export default function CheckoutForm({ locatorId, locatorName, hourlyRateCents }: { locatorId: string; locatorName: string; hourlyRateCents: number }) {
  const hourly = Math.round(hourlyRateCents / 100);
  const [hours, setHours] = useState(HOURS_MIN);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekly = hourly * hours;
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const stepHours = (dir: number) => setHours((h) => Math.min(HOURS_MAX, Math.max(HOURS_MIN, h + dir * HOURS_STEP)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/location-services/${locatorId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, hours }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Checkout failed"); return; }
      if (data.url) window.location.href = data.url;
      else setError("Invoice sent — check your email to complete payment.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const label = "mb-1 block text-xs font-medium text-gray-500";
  const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-black-primary">How many hours per week?</h2>
        <p className="mb-3 text-sm text-gray-500">In 5-hour steps, from {HOURS_MIN} up to {HOURS_MAX} hours.</p>
        <div className="flex items-center justify-center gap-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <button type="button" onClick={() => stepHours(-1)} disabled={hours <= HOURS_MIN}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            <Minus className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-3xl font-bold text-black-primary">{hours}</div>
            <div className="text-xs text-gray-400">hours / week</div>
          </div>
          <button type="button" onClick={() => stepHours(1)} disabled={hours >= HOURS_MAX}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-green-50 p-4">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{money(hourly)}/hr × {hours} hrs</span>
          <span className="text-xs text-gray-400">billed weekly</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-gray-900">Weekly total</span>
          <span className="text-2xl font-bold text-green-primary">{money(weekly)}<span className="text-sm font-medium text-gray-400">/week</span></span>
        </div>
      </div>

      <div className="space-y-3 border-t border-gray-100 pt-4">
        <label className="block"><span className={label}>Full name</span>
          <input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className={input} /></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>Email</span>
            <input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={input} /></label>
          <label className="block"><span className={label}>Phone (so {locatorName.split(" ")[0]} can call you)</span>
            <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={input} /></label>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-hover disabled:opacity-50">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Start for {money(weekly)}/week <ArrowRight className="h-4 w-4" /></>}
      </button>
      <p className="text-center text-xs text-gray-400">
        You&apos;re charged the first week up front and again every 7 days until you cancel. No account required.
      </p>
    </form>
  );
}
