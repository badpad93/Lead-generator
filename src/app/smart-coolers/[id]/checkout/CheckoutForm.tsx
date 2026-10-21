"use client";

import { useState } from "react";
import { Loader2, ArrowRight } from "lucide-react";

export default function CheckoutForm({ machineId }: { machineId: string }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/smart-coolers/machines/${machineId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Checkout failed");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Invoice sent — check your email to complete payment.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const label = "mb-1 block text-xs font-medium text-gray-500";
  const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none";

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className={label}>Full name</span>
        <input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className={input} />
      </label>
      <label className="block">
        <span className={label}>Email</span>
        <input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={input} />
      </label>
      <label className="block">
        <span className={label}>Phone</span>
        <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={input} />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-hover disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue to payment <ArrowRight className="h-4 w-4" /></>}
      </button>
    </form>
  );
}
