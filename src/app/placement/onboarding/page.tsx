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

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type PayoutMethod = "ach" | "manual_check" | "zelle" | "venmo" | "wire";
type AccountType = "checking" | "savings";

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
  const [idFile, setIdFile] = useState<File | null>(null);
  const [uploadedId, setUploadedId] = useState<{ id: string; file_name: string } | null>(null);

  // Step 5 — payout details
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>("ach");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("checking");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [savedBank, setSavedBank] = useState<{ method: string; account_last4: string | null } | null>(null);

  // Step 6 — Placement Provider Agreement
  const [agreementTemplate, setAgreementTemplate] = useState<{ id: string; version: number; title: string; effective_date: string; content_html: string } | null>(null);
  const [agreementRow, setAgreementRow] = useState<{ id: string; status: string } | null>(null);
  const [ppaTypedName, setPpaTypedName] = useState("");
  const [ppaAcknowledge, setPpaAcknowledge] = useState(false);
  const [ppaConsentEsign, setPpaConsentEsign] = useState(false);

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
      const idDoc = data.documents?.find((d: { document_type: string }) => d.document_type === "id");
      if (idDoc) setUploadedId({ id: idDoc.id, file_name: idDoc.file_name });

      // Load existing bank account (last4 only — full numbers never come back)
      const bankRes = await fetch("/api/marketplace/partners/bank-accounts", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (bankRes.ok) {
        const bankData = await bankRes.json();
        const b = bankData.bank_account;
        if (b) {
          setSavedBank({ method: b.method, account_last4: b.account_last4 || null });
          setPayoutMethod(b.method || "ach");
          setBankName(b.bank_name || "");
          setAccountHolder(b.account_holder || "");
          if (b.account_type) setAccountType(b.account_type);
          setPayoutNotes(b.notes || "");
        }
      }
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

  async function uploadIdDoc() {
    if (!idFile) return true; // Already uploaded previously
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", idFile);
    fd.append("type", "id");
    const res = await fetch("/api/marketplace/partners/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to upload driver's license");
      return false;
    }
    const doc = await res.json();
    setUploadedId({ id: doc.id, file_name: doc.file_name });
    setIdFile(null);
    return true;
  }

  async function saveBankAccount() {
    // Skip write if user hasn't changed anything and already has one on file
    // (full number fields blank means they're keeping the existing one).
    const routingDigits = routingNumber.replace(/\D/g, "");
    const accountDigits = accountNumber.replace(/\D/g, "");
    if (savedBank && !routingDigits && !accountDigits) return true;

    if (payoutMethod === "ach" || payoutMethod === "wire") {
      if (!bankName.trim()) { setError("Bank name is required"); return false; }
      if (!accountHolder.trim()) { setError("Account holder name is required"); return false; }
      if (routingDigits.length !== 9) { setError("Routing number must be 9 digits"); return false; }
      if (accountDigits.length < 4 || accountDigits.length > 17) { setError("Account number must be 4-17 digits"); return false; }
    } else {
      if (!accountHolder.trim()) { setError("Payee name is required"); return false; }
    }

    setSaving(true);
    setError(null);
    const res = await fetch("/api/marketplace/partners/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        method: payoutMethod,
        bank_name: bankName.trim() || null,
        account_holder: accountHolder.trim(),
        account_type: accountType,
        routing_number: routingDigits || null,
        account_number: accountDigits || null,
        notes: payoutNotes.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save payout details");
      return false;
    }
    const body = await res.json();
    if (body.bank_account) {
      setSavedBank({ method: body.bank_account.method, account_last4: body.bank_account.account_last4 || null });
      setRoutingNumber("");
      setAccountNumber("");
    }
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
    setStep(6);
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
      if (!uploadedId && !idFile) { setError("Please upload your driver's license to continue"); return; }
      const w9Ok = await uploadW9();
      if (!w9Ok) return;
      const idOk = await uploadIdDoc();
      if (!idOk) return;
      setStep(5);
    } else if (step === 5) {
      const ok = await saveBankAccount();
      if (!ok) return;
      // Load the PPA before showing the sign screen.
      await loadAgreement();
      setStep(6);
    } else if (step === 6) {
      const ok = await signAgreement();
      if (!ok) return;
      await completeOnboarding();
      setStep(7);
    }
  }

  async function loadAgreement() {
    if (!token) return;
    try {
      const res = await fetch("/api/placement/agreement", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAgreementTemplate(data.template);
        setAgreementRow(data.agreement);
        // If they've already signed (e.g., returning to onboarding), prefill.
        if (data.agreement?.provider_typed_name) setPpaTypedName(data.agreement.provider_typed_name);
      }
    } catch {}
  }

  async function signAgreement(): Promise<boolean> {
    if (!token) { setError("Session expired"); return false; }
    if (!ppaTypedName.trim()) { setError("Type your legal name to sign"); return false; }
    if (!ppaAcknowledge) { setError("Please acknowledge you have reviewed the agreement"); return false; }
    if (!ppaConsentEsign) { setError("Please consent to conduct business electronically"); return false; }

    // If already signed (returning user), skip re-signing.
    if (agreementRow && (agreementRow.status === "provider_signed_pending_company_countersign" || agreementRow.status === "fully_executed" || agreementRow.status === "legacy_approved")) {
      return true;
    }

    setSaving(true);
    setError(null);
    const res = await fetch("/api/placement/agreement/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ typed_name: ppaTypedName.trim(), consent_esign: ppaConsentEsign }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to submit signature");
      return false;
    }
    return true;
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
        {[1, 2, 3, 4, 5, 6].map((n) => (
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

        {/* STEP 4 — Documents (W-9 + Driver's License) */}
        {step === 4 && (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2"><FileText className="h-5 w-5 text-green-primary" /></div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
                <p className="text-xs text-gray-500">Required so we can pay you and verify your identity. Uploaded securely; only admins can view.</p>
              </div>
            </div>

            {/* W-9 */}
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-900 mb-2">W-9 tax form</p>
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
                <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-6 cursor-pointer hover:bg-gray-50 transition-colors">
                  <Upload className="h-6 w-6 text-gray-400" />
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
              <p className="mt-2 text-xs text-gray-500">
                Don&apos;t have a W-9 handy?{" "}
                <a href="https://www.irs.gov/pub/irs-pdf/fw9.pdf" target="_blank" rel="noopener noreferrer" className="text-green-primary hover:underline">
                  Download the IRS blank form here.
                </a>
              </p>
            </div>

            {/* Driver's License */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-2">Driver&apos;s license</p>
              {uploadedId ? (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-900">Driver&apos;s license uploaded</p>
                    <p className="text-xs text-green-700">{uploadedId.file_name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadedId(null)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 cursor-pointer"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-6 cursor-pointer hover:bg-gray-50 transition-colors">
                  <Upload className="h-6 w-6 text-gray-400" />
                  <p className="text-sm font-medium text-gray-700">
                    {idFile ? idFile.name : "Click to upload your driver's license"}
                  </p>
                  <p className="text-xs text-gray-400">PDF, PNG, or JPG</p>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              )}
              <p className="mt-2 text-xs text-gray-500">A photo of the front is fine. Used for identity verification only.</p>
            </div>
          </>
        )}

        {/* STEP 5 — Payout details */}
        {step === 5 && (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2"><Briefcase className="h-5 w-5 text-green-primary" /></div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Payout details</h2>
                <p className="text-xs text-gray-500">How should we pay you out? You can change this later from your dashboard.</p>
              </div>
            </div>

            {savedBank && (
              <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm">
                <p className="font-medium text-green-900">Current: {savedBank.method.replace("_", " ")}{savedBank.account_last4 ? ` — ****${savedBank.account_last4}` : ""}</p>
                <p className="text-xs text-green-700 mt-0.5">Leave routing / account fields blank below to keep this on file, or enter new values to replace it.</p>
              </div>
            )}

            <label className="block text-xs font-medium text-gray-600 mb-1">Payout method</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
              {(["ach", "wire", "manual_check", "zelle", "venmo"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayoutMethod(m)}
                  className={`rounded-xl border px-2 py-2 text-xs font-medium transition-colors cursor-pointer capitalize ${payoutMethod === m ? "border-green-primary bg-green-50 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  {m.replace("_", " ")}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {payoutMethod === "ach" || payoutMethod === "wire" ? "Account holder (name on the account)" : "Payee name"} *
                </label>
                <input
                  type="text"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder={payoutMethod === "ach" || payoutMethod === "wire" ? "Jane Doe" : "Payee name for the check / Zelle / Venmo"}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-green-primary focus:outline-none"
                />
              </div>

              {(payoutMethod === "ach" || payoutMethod === "wire") && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Bank name *</label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="Chase, Wells Fargo, etc."
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-green-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Account type</label>
                    <div className="flex gap-2">
                      {(["checking", "savings"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAccountType(t)}
                          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors cursor-pointer capitalize ${accountType === t ? "border-green-primary bg-green-50 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Routing number *</label>
                      <input
                        type="text"
                        value={routingNumber}
                        onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
                        placeholder="9 digits"
                        inputMode="numeric"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-green-primary focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Account number *</label>
                      <input
                        type="text"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 17))}
                        placeholder="4-17 digits"
                        inputMode="numeric"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-green-primary focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                <textarea
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  rows={2}
                  placeholder={payoutMethod === "zelle" ? "Zelle email or phone" : payoutMethod === "venmo" ? "Venmo handle (@username)" : payoutMethod === "manual_check" ? "Mailing address for check" : "Anything we should know about your account"}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none resize-none"
                />
              </div>
            </div>

            <p className="mt-4 text-xs text-gray-500">
              🔒 Routing and account numbers are stored securely and only viewable by our finance team when processing your payout. We&apos;ll show you only the last 4 digits on your dashboard.
            </p>
          </>
        )}

        {/* STEP 6 — Placement Provider Agreement */}
        {step === 6 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Placement Provider Agreement</h2>
            <p className="text-sm text-gray-500 mb-4">Please read the entire agreement below. Your typed name below is a legally binding electronic signature.</p>

            {agreementTemplate ? (
              <>
                <div className="text-xs text-gray-500 mb-2">
                  <strong className="text-gray-700">{agreementTemplate.title}</strong> · v{agreementTemplate.version} · effective {agreementTemplate.effective_date}
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: agreementTemplate.content_html }} />

                <div className="mt-4 space-y-2">
                  <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={ppaAcknowledge} onChange={(e) => setPpaAcknowledge(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-green-primary" />
                    <span>I have reviewed and agree to the Placement Provider Agreement.</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={ppaConsentEsign} onChange={(e) => setPpaConsentEsign(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-green-primary" />
                    <span>I consent to conduct this transaction electronically and agree that my typed name below is my electronic signature.</span>
                  </label>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type your full legal name to sign <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={ppaTypedName}
                    onChange={(e) => setPpaTypedName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none"
                    placeholder="Your legal name"
                  />
                </div>

                {agreementRow?.status === "provider_signed_pending_company_countersign" && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    You&apos;ve already signed this agreement. It&apos;s waiting for Vending Connector to countersign.
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
            )}
          </div>
        )}

        {/* STEP 7 — Success */}
        {step === 7 && (
          <div className="text-center py-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-primary" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">You&apos;re all set!</h2>
            <p className="text-sm text-gray-500 mb-6">{success}</p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left mb-6">
              <p className="text-sm font-medium text-blue-900 mb-1">What happens next?</p>
              <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                <li>Vending Connector reviews your profile and countersigns your agreement.</li>
                <li>You&apos;ll receive a copy of the fully executed agreement (usually within 1 business day).</li>
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
        {step < 7 && (
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
                  {step === 6 ? "Sign & Finish" : step === 5 ? "Continue to Agreement" : "Continue"} <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
