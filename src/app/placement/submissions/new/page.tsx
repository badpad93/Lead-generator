"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Upload, CheckCircle2, AlertCircle, Package } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { INDUSTRIES } from "@/app/placement/industries";
import { US_STATES } from "@/lib/types";

interface Contract {
  id: string;
  title: string;
  tier: number;
  partner_payout: number;
  market_state: string | null;
  market_city: string | null;
}

interface UploadedPhoto {
  id: string;
  file_url: string;
  file_name: string;
  caption: string | null;
}

function SubmissionFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contractId = searchParams.get("contract");

  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<Contract | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    business_name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    industry: "",
    employees: "",
    traffic_score: "",
    decision_maker_name: "",
    decision_maker_title: "",
    decision_maker_email: "",
    decision_maker_phone: "",
    power_available: true,
    parking_available: true,
    machine_recommendation: "",
    notes: "",
  });

  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const loadContract = useCallback(async () => {
    if (!token || !contractId) { setLoading(false); return; }
    const res = await fetch(`/api/marketplace/contracts/${contractId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setContract(data.contract);
      if (data.contract?.market_state) setForm((f) => ({ ...f, state: data.contract.market_state }));
      if (data.contract?.market_city) setForm((f) => ({ ...f, city: data.contract.market_city }));
    }
    setLoading(false);
  }, [token, contractId]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) {
        router.push(`/login?redirect=/placement/submissions/new${contractId ? `?contract=${contractId}` : ""}`);
        return;
      }
      setToken(session.access_token);
    });
  }, [router, contractId]);

  useEffect(() => { loadContract(); }, [loadContract]);

  async function submit() {
    if (!contractId) { setError("No contract selected"); return; }
    setError(null);
    setSaving(true);
    const payload = {
      contract_id: contractId,
      business_name: form.business_name.trim(),
      address: form.address.trim(),
      city: form.city.trim() || null,
      state: form.state || null,
      zip: form.zip.trim() || null,
      industry: form.industry || null,
      employees: form.employees ? Number(form.employees) : null,
      traffic_score: form.traffic_score ? Number(form.traffic_score) : null,
      decision_maker_name: form.decision_maker_name.trim() || null,
      decision_maker_title: form.decision_maker_title.trim() || null,
      decision_maker_email: form.decision_maker_email.trim() || null,
      decision_maker_phone: form.decision_maker_phone.trim() || null,
      power_available: form.power_available,
      parking_available: form.parking_available,
      machine_recommendation: form.machine_recommendation || null,
      notes: form.notes.trim() || null,
    };
    const res = await fetch("/api/marketplace/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Failed to submit");
      setSaving(false);
      return;
    }
    setSubmissionId(body.id);
    setSaving(false);
  }

  async function uploadPhoto(file: File) {
    if (!submissionId) return;
    setUploadingPhoto(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/marketplace/submissions/${submissionId}/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (res.ok) {
      const photo = await res.json();
      setPhotos((p) => [...p, photo]);
    }
    setUploadingPhoto(false);
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  if (!contractId || !contract) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-amber-500 mb-3" />
        <p className="text-lg font-semibold text-gray-900 mb-1">Contract required</p>
        <p className="text-sm text-gray-500 mb-6">Open a contract you&apos;ve accepted before submitting a location.</p>
        <Link href="/placement/contracts" className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-3 text-sm font-semibold text-white cursor-pointer">
          Browse Contracts
        </Link>
      </div>
    );
  }

  const inputClass = "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none";
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  if (submissionId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex items-center gap-3 mb-6">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-900">Location submitted</p>
            <p className="text-xs text-emerald-700">Add site photos below to give the reviewer more context. You can add more later.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Site Photos</h2>
          <p className="text-xs text-gray-500 mb-4">Show the exterior, planned machine spot, and any power outlets. Clear photos speed up approval.</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {photos.map((p) => (
              <div key={p.id} className="relative rounded-xl overflow-hidden bg-gray-100 aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.file_url} alt={p.file_name} className="w-full h-full object-cover" />
              </div>
            ))}
            <label className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-green-primary transition-colors aspect-square ${uploadingPhoto ? "opacity-50 pointer-events-none" : ""}`}>
              {uploadingPhoto ? (
                <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-gray-400" />
                  <span className="text-[10px] text-gray-500">Upload</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.currentTarget.value = ""; }}
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <Link
              href="/placement/submissions"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              Done
            </Link>
            <Link
              href={`/placement/submissions/${submissionId}`}
              className="rounded-lg bg-green-primary hover:bg-green-hover px-4 py-2 text-sm font-semibold text-white cursor-pointer"
            >
              View Submission
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href={`/placement/contracts/${contractId}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Contract
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Submit a Location</h1>
        <p className="text-sm text-gray-500 mt-1">
          For <span className="font-medium text-gray-700">{contract.title}</span> · Tier {contract.tier} · ${Number(contract.partner_payout).toLocaleString()}/location
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-5">
        {/* Business */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Business</h3>
          <div className="grid gap-3">
            <div>
              <label className={labelClass}>Business Name *</label>
              <input
                type="text"
                value={form.business_name}
                onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                placeholder="Acme Manufacturing"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Industry</label>
              <select
                value={form.industry}
                onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select…</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Address</h3>
          <div className="grid gap-3">
            <div>
              <label className={labelClass}>Street Address *</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="123 Industrial Pkwy"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelClass}>City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <select
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>ZIP</label>
              <input
                type="text"
                value={form.zip}
                onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Site */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Site Details</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClass}>Employees / Daily Traffic</label>
              <input
                type="number"
                min="0"
                value={form.employees}
                onChange={(e) => setForm((f) => ({ ...f, employees: e.target.value }))}
                placeholder="150"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Traffic Score (1-100)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.traffic_score}
                onChange={(e) => setForm((f) => ({ ...f, traffic_score: e.target.value }))}
                placeholder="75"
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.power_available}
                onChange={(e) => setForm((f) => ({ ...f, power_available: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              Power available
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.parking_available}
                onChange={(e) => setForm((f) => ({ ...f, parking_available: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              Parking available
            </label>
          </div>
        </div>

        {/* Decision maker */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Decision Maker</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Name</label>
              <input
                type="text"
                value={form.decision_maker_name}
                onChange={(e) => setForm((f) => ({ ...f, decision_maker_name: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input
                type="text"
                value={form.decision_maker_title}
                onChange={(e) => setForm((f) => ({ ...f, decision_maker_title: e.target.value }))}
                placeholder="HR / Facility Mgr"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={form.decision_maker_email}
                onChange={(e) => setForm((f) => ({ ...f, decision_maker_email: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input
                type="tel"
                value={form.decision_maker_phone}
                onChange={(e) => setForm((f) => ({ ...f, decision_maker_phone: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes for Reviewer</h3>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={4}
            placeholder="Anything the admin should know — access hours, verbal commitments, timing…"
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Link
            href={`/placement/contracts/${contractId}`}
            className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </Link>
          <button
            onClick={submit}
            disabled={saving || !form.business_name.trim() || !form.address.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-3 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Submit Location
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SubmissionFormPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>}>
      <SubmissionFormInner />
    </Suspense>
  );
}
