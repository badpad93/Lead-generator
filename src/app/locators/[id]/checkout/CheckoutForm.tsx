"use client";

import { useState } from "react";
import { Loader2, ArrowRight, Minus, Plus, X, CheckCircle2, Phone } from "lucide-react";

const HOURS_MIN = 15;
const HOURS_STEP = 5;
const HOURS_MAX = 40;
const MACHINE_TYPES = ["Combo", "AI", "Water", "Coffee", "ATM"] as const;
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

const money = (n: number) => `$${n.toLocaleString()}`;
const label = "mb-1 block text-xs font-medium text-gray-500";
const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none";

interface Needs {
  business_name: string; address: string; state: string; machine_count: string; machine_type: string;
  travel_radius_miles: string; excluded_industries: string; meeting_availability: string;
}
const EMPTY_NEEDS: Needs = {
  business_name: "", address: "", state: "", machine_count: "", machine_type: "",
  travel_radius_miles: "", excluded_industries: "", meeting_availability: "",
};

export default function CheckoutForm({ locatorId, locatorName, hourlyRateCents }: { locatorId: string; locatorName: string; hourlyRateCents: number }) {
  const hourly = Math.round(hourlyRateCents / 100);
  const [contact, setContact] = useState({ full_name: "", email: "", phone: "" });
  const [needs, setNeeds] = useState<Needs>(EMPTY_NEEDS);
  const [zips, setZips] = useState<string[]>([""]);
  const [hours, setHours] = useState(HOURS_MIN);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  const weekly = hourly * hours;
  const setC = (k: keyof typeof contact, v: string) => setContact((f) => ({ ...f, [k]: v }));
  const setN = (k: keyof Needs, v: string) => setNeeds((f) => ({ ...f, [k]: v }));
  const stepHours = (dir: number) => setHours((h) => Math.min(HOURS_MAX, Math.max(HOURS_MIN, h + dir * HOURS_STEP)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const validZips = zips.map((z) => z.trim()).filter(Boolean);
      const res = await fetch(`/api/location-services/${locatorId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contact,
          hours,
          location_needs: { ...needs, machine_count: Number(needs.machine_count), zip_codes: validZips },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Checkout failed"); return; }
      setInvoiceUrl(data.url || null);
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <Success invoiceUrl={invoiceUrl} />;

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-base font-bold text-black-primary">Your contact details</h2>
        <label className="block"><span className={label}>Full name</span>
          <input required value={contact.full_name} onChange={(e) => setC("full_name", e.target.value)} className={input} /></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>Email</span>
            <input required type="email" value={contact.email} onChange={(e) => setC("email", e.target.value)} className={input} /></label>
          <label className="block"><span className={label}>Phone</span>
            <input type="tel" value={contact.phone} onChange={(e) => setC("phone", e.target.value)} className={input} /></label>
        </div>
      </section>

      <section className="space-y-3 border-t border-gray-100 pt-5">
        <h2 className="text-base font-bold text-black-primary">Your location needs</h2>
        <label className="block"><span className={label}>Business name</span>
          <input required value={needs.business_name} onChange={(e) => setN("business_name", e.target.value)} className={input} /></label>
        <label className="block"><span className={label}>Address</span>
          <input required value={needs.address} onChange={(e) => setN("address", e.target.value)} className={input} /></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>State</span>
            <select required value={needs.state} onChange={(e) => setN("state", e.target.value)} className={input}>
              <option value="">Select state</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></label>
          <label className="block"><span className={label}>Machines needed</span>
            <input required type="number" min={1} value={needs.machine_count} onChange={(e) => setN("machine_count", e.target.value)} className={input} /></label>
        </div>
        <label className="block"><span className={label}>Machine type</span>
          <select required value={needs.machine_type} onChange={(e) => setN("machine_type", e.target.value)} className={input}>
            <option value="">Select type</option>
            {MACHINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></label>
        <ZipList zips={zips} setZips={setZips} />
        <label className="block"><span className={label}>How far can you travel for a location? (miles, optional)</span>
          <input type="number" min={0} value={needs.travel_radius_miles} onChange={(e) => setN("travel_radius_miles", e.target.value)} className={input} /></label>
        <label className="block"><span className={label}>Industries to avoid (optional)</span>
          <textarea rows={2} value={needs.excluded_industries} onChange={(e) => setN("excluded_industries", e.target.value)} className={input} /></label>
        <label className="block"><span className={label}>General availability for meetings (optional)</span>
          <textarea rows={2} value={needs.meeting_availability} onChange={(e) => setN("meeting_availability", e.target.value)} className={input} /></label>
      </section>

      <section className="border-t border-gray-100 pt-5">
        <h2 className="mb-1 text-base font-bold text-black-primary">Hours per week with {locatorName}</h2>
        <p className="mb-3 text-sm text-gray-500">In 5-hour steps, {HOURS_MIN}–{HOURS_MAX} hours. Billed weekly.</p>
        <div className="flex items-center justify-center gap-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <button type="button" onClick={() => stepHours(-1)} disabled={hours <= HOURS_MIN}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
          <div className="text-center"><div className="text-3xl font-bold text-black-primary">{hours}</div><div className="text-xs text-gray-400">hours / week</div></div>
          <button type="button" onClick={() => stepHours(1)} disabled={hours >= HOURS_MAX}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 flex items-baseline justify-between rounded-xl bg-green-50 px-4 py-3">
          <span className="text-sm text-gray-600">{money(hourly)}/hr × {hours} hrs</span>
          <span className="text-2xl font-bold text-green-primary">{money(weekly)}<span className="text-sm font-medium text-gray-400">/week</span></span>
        </div>
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-hover disabled:opacity-50">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Pay {money(weekly)} & request <ArrowRight className="h-4 w-4" /></>}
      </button>
      <p className="text-center text-xs text-gray-400">
        Locations aren&apos;t guaranteed. You&apos;re billed the weekly amount up front and again every 7 days until you cancel.
      </p>
    </form>
  );
}

function ZipList({ zips, setZips }: { zips: string[]; setZips: (u: (z: string[]) => string[]) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className={label}>Target ZIP codes</span>
        <button type="button" onClick={() => setZips((z) => [...z, ""])} className="inline-flex items-center gap-1 text-xs font-medium text-green-primary hover:text-green-hover">
          <Plus className="h-3.5 w-3.5" /> Add ZIP
        </button>
      </div>
      <div className="space-y-2">
        {zips.map((zip, i) => (
          <div key={i} className="flex gap-2">
            <input value={zip} required={i === 0} placeholder={`ZIP ${i + 1}`}
              onChange={(e) => setZips((z) => z.map((v, idx) => (idx === i ? e.target.value : v)))} className={input} />
            {zips.length > 1 && (
              <button type="button" onClick={() => setZips((z) => z.filter((_, idx) => idx !== i))}
                className="rounded-lg border border-gray-200 px-2.5 text-gray-400 hover:border-red-200 hover:text-red-500"><X className="h-4 w-4" /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Success({ invoiceUrl }: { invoiceUrl: string | null }) {
  return (
    <div className="py-6 text-center">
      <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
        <CheckCircle2 className="h-9 w-9 text-green-600" />
      </div>
      <h2 className="text-xl font-bold text-black-primary">You&apos;re all set!</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-500">
        A locator will reach out within 24 hours to go over your location needs.
      </p>
      {invoiceUrl ? (
        <a href={invoiceUrl} className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-green-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-hover">
          <Phone className="h-4 w-4" /> Complete your first payment
        </a>
      ) : (
        <p className="mt-4 text-xs text-gray-400">We&apos;ve emailed your invoice — complete payment to get started.</p>
      )}
    </div>
  );
}
