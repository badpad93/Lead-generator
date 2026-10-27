"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { MapPin, Plus, X, CheckCircle2, Loader2 } from "lucide-react";

interface FormState {
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  zip_codes: string[];
  machine_count: string;
  machine_type: string;
  travel_radius_miles: string;
  excluded_industries: string;
  meeting_availability: string;
}

const initial: FormState = {
  business_name: "",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  state: "",
  zip_codes: [""],
  machine_count: "",
  machine_type: "",
  travel_radius_miles: "",
  excluded_industries: "",
  meeting_availability: "",
};

// The five product lines the operator can request a location for.
// Kept in one place so the label rendered in the receipt matches the
// select value byte-for-byte (the API validates against this list).
const MACHINE_TYPES = ["Combo", "AI", "Water", "Coffee", "ATM"] as const;

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

export default function RequestLocationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <RequestLocationInner />
    </Suspense>
  );
}

function RequestLocationInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [ref, setRef] = useState<string>("");
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = searchParams.get("ref");
    if (r) setRef(r);
  }, [searchParams]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateZip(index: number, value: string) {
    setForm((f) => {
      const zips = [...f.zip_codes];
      zips[index] = value;
      return { ...f, zip_codes: zips };
    });
  }

  function addZip() {
    setForm((f) => ({ ...f, zip_codes: [...f.zip_codes, ""] }));
  }

  function removeZip(index: number) {
    setForm((f) => ({
      ...f,
      zip_codes: f.zip_codes.filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.business_name.trim()) { setError("Please fill in business name."); return; }
    if (!form.contact_name.trim()) { setError("Please fill in contact name."); return; }
    if (!form.phone.trim()) { setError("Please fill in phone number."); return; }
    if (!form.email.trim()) { setError("Please fill in email."); return; }
    if (!form.address.trim()) { setError("Please fill in address."); return; }
    if (!form.state) { setError("Please select a state."); return; }
    const validZips = form.zip_codes.map((z) => z.trim()).filter(Boolean);
    if (validZips.length === 0) { setError("Please enter at least one ZIP code."); return; }
    if (!form.machine_count.trim()) { setError("Please fill in number of machines."); return; }
    if (!form.machine_type) { setError("Please select a machine type."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/request-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: form.business_name,
          contact_name: form.contact_name,
          phone: form.phone,
          email: form.email,
          address: form.address,
          state: form.state,
          zip_codes: validZips,
          machine_count: Number(form.machine_count),
          machine_type: form.machine_type,
          travel_radius_miles: form.travel_radius_miles ? Number(form.travel_radius_miles) : null,
          excluded_industries: form.excluded_industries || null,
          meeting_availability: form.meeting_availability || null,
          ref: ref || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }

      // No deposit — show the thank-you, then route to available locations.
      setSubmitted(true);
      setTimeout(() => router.push("/browse-requests"), 5000);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-light to-light-warm py-16">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="rounded-2xl border border-green-100 bg-white p-6 text-center shadow-lg sm:p-10">
            <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="h-9 w-9 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-black-primary sm:text-3xl">Thank you for the info!</h1>
            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-black-primary/60">
              A location specialist will be with you within 24 hours. Until then, please view our available
              locations. Thank you!
            </p>
            <Link
              href="/browse-requests"
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
            >
              View available locations
            </Link>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Taking you there…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-light to-light-warm py-16">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-primary">
            <MapPin className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-black-primary sm:text-4xl">
            Request Location Services
          </h1>
          <p className="mt-3 text-base text-black-primary/60 sm:text-lg">
            Let Apex AI Vending find high-quality locations for your machines.
          </p>
        </div>

        <div className="rounded-2xl border border-green-100 bg-white p-6 shadow-lg sm:p-8">
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm text-green-800">
              Tell us what you need and a location specialist will reach out within 24 hours. No payment required to get started.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Business Name" value={form.business_name} onChange={(v) => update("business_name", v)} />
            <Field label="Contact Name" value={form.contact_name} onChange={(v) => update("contact_name", v)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone Number" type="tel" value={form.phone} onChange={(v) => update("phone", v)} />
              <Field label="Email" type="email" value={form.email} onChange={(v) => update("email", v)} />
            </div>
            <Field label="Full Address" value={form.address} onChange={(v) => update("address", v)} />

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-black-primary">State</span>
                <select
                  value={form.state}
                  onChange={(e) => update("state", e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-black-primary outline-none transition-colors focus:border-green-primary focus:ring-2 focus:ring-green-100 cursor-pointer"
                >
                  <option value="">Select State</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <Field label="Number of Machines Needed" type="number" value={form.machine_count} onChange={(v) => update("machine_count", v)} />
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-black-primary">Machine Type</span>
              <select
                value={form.machine_type}
                onChange={(e) => update("machine_type", e.target.value)}
                required
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-black-primary outline-none transition-colors focus:border-green-primary focus:ring-2 focus:ring-green-100 cursor-pointer"
              >
                <option value="">Select Machine Type</option>
                {MACHINE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-black-primary">
                How far can you travel for a location? <span className="text-black-primary/40 font-normal">(miles)</span>
              </span>
              <input
                type="number"
                min={0}
                value={form.travel_radius_miles}
                onChange={(e) => update("travel_radius_miles", e.target.value)}
                placeholder="e.g. 25"
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-black-primary outline-none transition-colors focus:border-green-primary focus:ring-2 focus:ring-green-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-black-primary">
                Are there any industries you don&apos;t want to work in? <span className="text-black-primary/40 font-normal">(optional)</span>
              </span>
              <textarea
                rows={2}
                value={form.excluded_industries}
                onChange={(e) => update("excluded_industries", e.target.value)}
                placeholder="e.g. bars, tobacco shops, adult retail"
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-black-primary outline-none transition-colors focus:border-green-primary focus:ring-2 focus:ring-green-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-black-primary">
                General availability for meetings <span className="text-black-primary/40 font-normal">(optional)</span>
              </span>
              <textarea
                rows={2}
                value={form.meeting_availability}
                onChange={(e) => update("meeting_availability", e.target.value)}
                placeholder="e.g. Weekday mornings before 11am, or any weekend"
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-black-primary outline-none transition-colors focus:border-green-primary focus:ring-2 focus:ring-green-100"
              />
            </label>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-black-primary">Target ZIP Codes</span>
                <button
                  type="button"
                  onClick={addZip}
                  className="inline-flex items-center gap-1 text-xs font-medium text-green-primary hover:text-green-hover cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add ZIP
                </button>
              </div>
              <div className="space-y-2">
                {form.zip_codes.map((zip, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={zip}
                      onChange={(e) => updateZip(i, e.target.value)}
                      placeholder={`ZIP code ${i + 1}`}
                      required={i === 0}
                      className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-black-primary outline-none transition-colors focus:border-green-primary focus:ring-2 focus:ring-green-100"
                    />
                    {form.zip_codes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeZip(i)}
                        className="rounded-lg border border-gray-200 px-2.5 text-gray-400 hover:text-red-500 hover:border-red-200 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-black-primary">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        min={type === "number" ? 1 : undefined}
        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-black-primary outline-none transition-colors focus:border-green-primary focus:ring-2 focus:ring-green-100"
      />
    </label>
  );
}
