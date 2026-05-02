"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  User,
  DollarSign,
  Shield,
  CheckCircle2,
  Percent,
  Handshake,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

const CREDIT_RANGES = ["Below 600", "600–649", "650–699", "700–749", "750+"];
const NET_WORTH_RANGES = [
  "Below $50,000",
  "$50,000–$100,000",
  "$100,000–$250,000",
  "$250,000–$500,000",
  "$500,000+",
];
const CITIZENSHIP_OPTIONS = [
  "US Citizen",
  "Permanent Resident",
  "Non-Citizen National",
  "Other",
];

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
      >
        <option value="">Select</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
  );
}

export default function FinancingPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Applicant
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [citizenship, setCitizenship] = useState("");

  // Financial
  const [creditRange, setCreditRange] = useState("");
  const [netWorthRange, setNetWorthRange] = useState("");
  const [annualIncome, setAnnualIncome] = useState("");
  const [verifiableIncome, setVerifiableIncome] = useState("");
  const [taxLiens, setTaxLiens] = useState("");
  const [bankruptcy, setBankruptcy] = useState("");
  const [judgments, setJudgments] = useState("");

  // Background
  const [felony, setFelony] = useState("");
  const [legalActions, setLegalActions] = useState("");
  const [federalDebt, setFederalDebt] = useState("");

  // Agreements
  const [agreedDocs, setAgreedDocs] = useState(false);
  const [agreedAccurate, setAgreedAccurate] = useState(false);

  useEffect(() => {
    async function prefill() {
      try {
        const supabase = createBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setEmail(user.email || "");
          const meta = user.user_metadata || {};
          setFullName(meta.full_name || meta.name || "");
          setPhone(meta.phone || "");
        }
      } catch {
        // ignore
      }
    }
    prefill();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (!agreedDocs || !agreedAccurate) {
      setError("You must agree to both attestations before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch("/api/financing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          date_of_birth: dob || null,
          citizenship_status: citizenship || null,
          credit_score_range: creditRange || null,
          net_worth_range: netWorthRange || null,
          annual_income: annualIncome.trim() || null,
          has_verifiable_income: verifiableIncome === "yes",
          has_tax_liens: taxLiens === "yes",
          has_bankruptcy: bankruptcy === "yes",
          has_judgments: judgments === "yes",
          has_felony: felony === "yes",
          has_legal_actions: legalActions === "yes",
          has_federal_debt: federalDebt === "yes",
          agreed_provide_docs: agreedDocs,
          agreed_accurate_info: agreedAccurate,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to submit. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted</h1>
          <p className="text-sm text-gray-600 mb-6">
            Thank you for submitting your SBA financing pre-qualification form. Our team will review your information and reach out to you shortly with next steps.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-600 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Pre-Qualify for SBA Financing</h1>
          <p className="text-sm text-gray-500 mt-1">
            Complete our quick screening form to see if you may qualify for SBA financing to fund your Apex AI Vending micro-market business.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <Percent className="mx-auto mb-2 h-5 w-5 text-green-600" />
            <p className="text-xs font-semibold text-green-700">Low Interest Rates</p>
            <p className="text-[10px] text-green-600 mt-0.5">SBA loans offer competitive rates for qualified applicants</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <Handshake className="mx-auto mb-2 h-5 w-5 text-green-600" />
            <p className="text-xs font-semibold text-green-700">Trusted Process</p>
            <p className="text-[10px] text-green-600 mt-0.5">We connect you with vetted SBA-approved lenders</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <Clock className="mx-auto mb-2 h-5 w-5 text-green-600" />
            <p className="text-xs font-semibold text-green-700">Quick Screening</p>
            <p className="text-[10px] text-green-600 mt-0.5">Get preliminary results in minutes, not days</p>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 mb-6">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            <strong>Important:</strong> This is a preliminary screening form only. Completing this form does not guarantee loan approval. Final approval is subject to lender review and verification of all provided information.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Section 1: Applicant Information */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-green-600" />
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">1. Applicant Information</h2>
                  <p className="text-[11px] text-gray-400">Basic identifiers for your application</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone *</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <SelectField
                  label="Citizenship Status"
                  value={citizenship}
                  onChange={setCitizenship}
                  options={CITIZENSHIP_OPTIONS}
                  placeholder="Select citizenship status"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Financial and Credit Information */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">2. Financial and Credit Information</h2>
                  <p className="text-[11px] text-gray-400">To assess repayment ability</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="Credit Score Range"
                  value={creditRange}
                  onChange={setCreditRange}
                  options={CREDIT_RANGES}
                  placeholder="Select credit score range"
                />
                <SelectField
                  label="Net Worth Range"
                  value={netWorthRange}
                  onChange={setNetWorthRange}
                  options={NET_WORTH_RANGES}
                  placeholder="Select net worth range"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Annual Income</label>
                <input
                  type="text"
                  value={annualIncome}
                  onChange={(e) => setAnnualIncome(e.target.value)}
                  placeholder="e.g., $75,000"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm placeholder:text-gray-300 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <YesNoField label="Do you have verifiable income?" value={verifiableIncome} onChange={setVerifiableIncome} />
                <YesNoField label="Any outstanding tax liens?" value={taxLiens} onChange={setTaxLiens} />
                <YesNoField label="Filed for bankruptcy in the last 7 years?" value={bankruptcy} onChange={setBankruptcy} />
                <YesNoField label="Any outstanding judgments against you?" value={judgments} onChange={setJudgments} />
              </div>
            </div>
          </div>

          {/* Section 3: Background and Declarations */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-600" />
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">3. Background and Declarations</h2>
                  <p className="text-[11px] text-gray-400">Character and compliance screening</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <YesNoField label="Have you been convicted of a felony?" value={felony} onChange={setFelony} />
              <YesNoField label="Are you currently involved in any legal actions?" value={legalActions} onChange={setLegalActions} />
              <YesNoField label="Are you delinquent on any federal debt?" value={federalDebt} onChange={setFederalDebt} />
            </div>
          </div>

          {/* Agreements */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <h2 className="text-sm font-semibold text-gray-900">Agreements &amp; Attestation</h2>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedDocs}
                  onChange={(e) => setAgreedDocs(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm text-gray-700">
                  I agree to provide financial documentation (tax returns, bank statements, etc.) upon request to support my application.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedAccurate}
                  onChange={(e) => setAgreedAccurate(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm text-gray-700">
                  I attest that all information provided in this form is accurate and complete to the best of my knowledge. I understand that providing false information may result in denial of financing.
                </span>
              </label>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !agreedDocs || !agreedAccurate}
            className="w-full rounded-xl bg-green-600 px-6 py-4 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Pre-Qualification Application"
            )}
          </button>

          <p className="text-xs text-gray-400 text-center mt-3">
            Your information is securely transmitted and will only be shared with SBA-approved lenders.
          </p>
        </form>
      </div>
    </div>
  );
}
