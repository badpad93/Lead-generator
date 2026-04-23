"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, Plus, X } from "lucide-react";

interface FormState {
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  zip_codes: string[];
  machine_count: string;
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
};

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
  const [ref, setRef] = useState<string>("");
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
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
          ref: ref || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setForm(initial);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-light to-light-warm py-16">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-primary">
            <MapPin className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-black-primary sm:text-4xl">
            Request Location Services
          </h1>
          <p className="mt-3 text-base text-black-primary/60 sm:text-lg">
            Let Apex AI Vending find high-quality locations for your machines.
          </p>
        </div>

        <div className="rounded-2xl border border-green-100 bg-white p-6 shadow-lg sm:p-8">
          {success ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-primary text-3xl">
                ✓
              </div>
              <h2 className="text-xl font-bold text-black-primary">
                Request Submitted
              </h2>
              <p className="mt-2 text-sm text-black-primary/60">
                Your request has been submitted. Our team will contact you shortly.
              </p>
              <button
                type="button"
                onClick={() => setSuccess(false)}
                className="mt-6 rounded-lg bg-green-primary px-5 py-2 text-sm font-semibold text-white hover:bg-green-hover"
              >
                Submit Another
              </button>
            </div>
          ) : (
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
                className="w-full rounded-xl bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </form>
          )}
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
