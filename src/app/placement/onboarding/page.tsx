"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, CheckCircle2, ArrowRight, ArrowLeft, Building2, MapPin, Briefcase,
  FileText, User, AlertCircle, Upload,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { INDUSTRIES } from "../industries";

interface Territory {
  state: string;
  city?: string;
  travel_radius_miles?: number;
}

type Step = 1 | 2 | 3 | 4 | 5;

export default function MarketplaceOnboardingPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [partnerType, setPartnerType] = useState<"individual" | "company_owner">("individual");
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");

  // Step 2
  // Placement partners cover the entire United States by default. The onboarding
  // wizard doesn't ask for per-state coverage; the "US" sentinel is treated as
  // a nationwide wildcard by the contracts feed + eligibility helper.
  const [territories, setTerritories] = useState<Territory[]>([{ state: "US", city: "", travel_radius_miles: undefined }]);

  // Step 3
  const [industries, setIndustries] = useState<string[]>([]);

  // Step 4
  const [w9File, setW9File] = useState<File | null>(null);
  const [uploadedW9, setUploadedW9] = useState<{ id: string; file_name: string } | null>(null);

  // Load existing state
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { router.push("/login?redirect=/placement/onboarding"); return; }
      setToken(session.access_token);

      const res = await fetch("/api/marketplace/partners", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.partner) {
        setPartnerType(data.partner.partner_type === "company_owner" ? "company_owner" : "individual");
        setBusinessName(data.partner.business_name || "");
        setBio(data.partner.bio || "");
      }
      if (data.territories?.length) {
        setTerritories(data.territories.map((t: Territory & { travel_radius_miles?: number }) => ({
          state: t.state || "",
          city: t.city || "",
          travel_radius_miles: t.travel_radius_miles || 25,
        })));
      }
      if (data.industries?.length) {
        setIndustries(data.industries.map((i: { industry: string }) => i.industry));
      }
      const w9 = data.documents?.find((d: { document_type: string }) => d.document_type === "w9");
      if (w9) setUploadedW9({ id: w9.id, file_name: w9.file_name });
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/marketplace/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ partner_type: partnerType, business_name: businessName, bio }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save profile");
      return false;
    }
    return true;
  }

  async function saveTerritories() {
    // Nationwide coverage — always saves a single "US" wildcard row and
    // replaces whatever was there before. No per-state selection needed.
    setSaving(true);
    setError(null);
    const res = await fetch("/api/marketplace/partners/territories", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ territories: [{ state: "US", city: "", travel_radius_miles: null }] }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save territories");
      return false;
    }
    return true;
  }

  async function saveIndustries() {
    if (industries.length === 0) {
      setError("Select at least one industry");
      return false;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/marketplace/partners/industries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ industries }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save industries");
      return false;
    }
    return true;
  }

  async function uploadW9() {
    if (!w9File) return true; // Already uploaded previously
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", w9File);
    fd.append("type", "w9");
    const res = await fetch("/api/marketplace/partners/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to upload W9");
      return false;
    }
    const doc = await res.json();
    setUploadedW9({ id: doc.id, file_name: doc.file_name });
    setW9File(null);
    return true;
  }

  async function completeOnboarding() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/marketplace/partners/complete", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to complete onboarding");
      return;
    }
    setSuccess("You're all set — your profile is now under review.");
    setStep(5);
  }

  async function nextStep() {
    setError(null);
    if (step === 1) {
      if (!businessName.trim()) { setError("Business or full name is required"); return; }
      const ok = await saveProfile();
      if (ok) setStep(2);
    } else if (step === 2) {
      const ok = await saveTerritories();
      if (ok) setStep(3);
    } else if (step === 3) {
      const ok = await saveIndustries();
      if (ok) setStep(4);
    } else if (step === 4) {
      if (!uploadedW9 && !w9File) { setError("Please upload your W9 to continue"); return; }
      const uploaded = await uploadW9();
      if (uploaded) await completeOnboarding();
    }
  }

  function prevStep() {
    setError(null);
    if (step > 1) setStep((step - 1) as Step);
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Placement Partner Onboarding</h1>
        <p className="text-sm text-gray-500 mt-1">
          Set up your profile so we can match you with contracts in your territory.
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-2">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex-1">
            <div className={`h-1.5 rounded-full ${step >= n ? "bg-green-600" : "bg-gray-200"}`} />
            <div className={`mt-1 text-xs font-medium ${step === n ? "text-green-700" : step > n ? "text-green-600" : "text-gray-400"}`}>
              Step {n}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 sm:p-8">

        {/* STEP 1 — Profile */}
        {step === 1 && (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2"><User className="h-5 w-5 text-green-primary" /></div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Your profile</h2>
                <p className="text-xs text-gray-500">Tell us about yourself or your business.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">I&apos;m signing up as</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPartnerType("individual")}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${partnerType === "individual" ? "border-green-primary bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}
                  >
                    <User className={`h-5 w-5 mt-0.5 shrink-0 ${partnerType === "individual" ? "text-green-primary" : "text-gray-400"}`} />
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Individual</p>
                      <p className="text-xs text-gray-500">Just me — I&apos;ll be the one submitting locations.</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartnerType("company_owner")}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${partnerType === "company_owner" ? "border-green-primary bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}
                  >
                    <Building2 className={`h-5 w-5 mt-0.5 shrink-0 ${partnerType === "company_owner" ? "text-green-primary" : "text-gray-400"}`} />
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Company / Team</p>
                      <p className="text-xs text-gray-500">I have or will build a team of agents.</p>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {partnerType === "company_owner" ? "Company name" : "Business name (or your full name)"} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={partnerType === "company_owner" ? "ABC Placement Services" : "John Smith"}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Short bio (optional)</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="Anything the platform team should know about you or your experience."
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary/30 resize-none"
                />
              </div>
            </div>
          </>
        )}

        {/* STEP 2 — Coverage area (nationwide) */}
        {step === 2 && (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2"><MapPin className="h-5 w-5 text-green-primary" /></div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Area of operation</h2>
                <p className="text-xs text-gray-500">All placement partners cover the entire United States. Contracts are matched to you based on industry fit and capacity.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-green-100 bg-green-50 p-5 flex items-center gap-4">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <MapPin className="h-6 w-6 text-green-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">United States</p>
                <p className="text-xs text-gray-600 mt-0.5">You&apos;ll see every contract that matches your industries — anywhere in the country.</p>
              </div>
            </div>
          </>
        )}

        {/* STEP 3 — Industries */}
        {step === 3 && (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2"><Briefcase className="h-5 w-5 text-green-primary" /></div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Target industries</h2>
                <p className="text-xs text-gray-500">Pick the industries you can secure locations in.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {INDUSTRIES.map((ind) => {
                const active = industries.includes(ind);
                return (
                  <button
                    key={ind}
                    type="button"
                    onClick={() => setIndustries(active ? industries.filter((i) => i !== ind) : [...industries, ind])}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${active ? "border-green-primary bg-green-50 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                  >
                    {active && <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />}
                    {ind}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* STEP 4 — W9 */}
        {step === 4 && (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2"><FileText className="h-5 w-5 text-green-primary" /></div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">W-9 tax form</h2>
                <p className="text-xs text-gray-500">Required so we can pay you. Uploaded securely; only admins can view.</p>
              </div>
            </div>

            {uploadedW9 ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900">W-9 uploaded</p>
                  <p className="text-xs text-green-700">{uploadedW9.file_name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadedW9(null)}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 cursor-pointer"
                >
                  Replace
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-8 cursor-pointer hover:bg-gray-50 transition-colors">
                <Upload className="h-8 w-8 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">
                  {w9File ? w9File.name : "Click to upload your W-9"}
                </p>
                <p className="text-xs text-gray-400">PDF, PNG, or JPG</p>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setW9File(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            )}

            <p className="mt-4 text-xs text-gray-500">
              Don&apos;t have a W-9 handy?{" "}
              <a href="https://www.irs.gov/pub/irs-pdf/fw9.pdf" target="_blank" rel="noopener noreferrer" className="text-green-primary hover:underline">
                Download the IRS blank form here.
              </a>
            </p>
          </>
        )}

        {/* STEP 5 — Success */}
        {step === 5 && (
          <div className="text-center py-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-primary" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">You&apos;re all set!</h2>
            <p className="text-sm text-gray-500 mb-6">{success}</p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left mb-6">
              <p className="text-sm font-medium text-blue-900 mb-1">What happens next?</p>
              <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                <li>The Vending Connector team reviews your profile and verifies your W-9.</li>
                <li>You&apos;ll receive an email once approved (usually within 1 business day).</li>
                <li>Then you&apos;ll start seeing contract offers in your dashboard.</li>
              </ol>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full py-3 px-4 bg-green-primary hover:bg-green-hover text-white font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        )}

        {/* Navigation */}
        {step < 5 && (
          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={prevStep}
              disabled={step === 1 || saving}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary disabled:opacity-40 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={nextStep}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  {step === 4 ? "Finish" : "Continue"} <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
