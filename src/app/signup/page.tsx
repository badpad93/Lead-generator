"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Truck, Building2, UserPlus, ArrowLeft, Loader2, LogOut } from "lucide-react";
import { signUpWithGoogle, signUpWithMicrosoft, storeSignupRole, storeSignupLead, storeRedirectAfterLogin, ensureSignedOut } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabase";

type Role = "operator" | "location_manager";

const roles: { value: Role; label: string; icon: typeof Truck; description: string }[] = [
  {
    value: "operator",
    label: "Operator",
    icon: Truck,
    description: "I own/operate vending machines and want new locations",
  },
  {
    value: "location_manager",
    label: "Location",
    icon: Building2,
    description: "I have a property and want a vending machine placed",
  },
];

const ENTITY_TYPES = [
  { value: "operator", label: "Operator" },
  { value: "location", label: "Location" },
  { value: "machine_sales", label: "Machine Sales" },
  { value: "vending_maintenance", label: "Vending Maintenance" },
];

const IMMEDIATE_NEEDS = [
  { value: "location", label: "Location" },
  { value: "machine", label: "Machine" },
  { value: "digital", label: "Digital" },
  { value: "llc_compliance", label: "LLC/Compliance" },
  { value: "coffee", label: "Coffee" },
  { value: "financing", label: "Financing" },
  { value: "total_operator_package", label: "Total Operator Package" },
];

export default function SignupPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"google" | "microsoft" | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const [leadForm, setLeadForm] = useState({
    business_name: "",
    contact_name: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    entity_type: "",
    immediate_need: "",
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setExistingEmail(session.user.email);
      }
    });
  }, []);

  async function handleSignOutAndContinue() {
    setSigningOut(true);
    try {
      const cleared = await ensureSignedOut();
      if (!cleared) {
        setError("Failed to fully sign out. Please refresh and try again.");
      } else {
        setExistingEmail(null);
      }
    } catch {
      setError("Failed to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  function handleRoleSelect(selected: Role) {
    setRole(selected);
    setError(null);
    if (!leadForm.entity_type) {
      const mapped = selected === "operator" ? "operator" : "location";
      setLeadForm((f) => ({ ...f, entity_type: mapped }));
    }
  }

  function handleContinueToInfo() {
    if (!role) return;
    setStep(2);
  }

  function handleContinueToAuth() {
    if (!leadForm.business_name.trim()) {
      setError("Business name is required");
      return;
    }
    if (!leadForm.contact_name.trim()) {
      setError("Contact name is required");
      return;
    }
    if (!leadForm.phone.trim()) {
      setError("Phone number is required");
      return;
    }
    if (!leadForm.city.trim()) {
      setError("City is required");
      return;
    }
    if (!leadForm.state.trim()) {
      setError("State is required");
      return;
    }
    if (!leadForm.zip.trim()) {
      setError("Zip code is required");
      return;
    }
    setError(null);
    setStep(3);
  }

  function storeLead() {
    storeSignupLead({
      business_name: leadForm.business_name.trim(),
      contact_name: leadForm.contact_name.trim(),
      phone: leadForm.phone.trim(),
      address: leadForm.address.trim(),
      city: leadForm.city.trim(),
      state: leadForm.state.trim(),
      zip: leadForm.zip.trim(),
      entity_type: leadForm.entity_type,
      immediate_need: leadForm.immediate_need,
    });
  }

  async function handleGoogleSignup() {
    if (!role) return;
    setLoading("google");
    setError(null);

    try {
      const cleared = await ensureSignedOut();
      if (!cleared) {
        setError("Could not clear existing session. Please refresh and try again.");
        setLoading(null);
        return;
      }
      setExistingEmail(null);

      storeSignupRole(role);
      storeLead();
      storeRedirectAfterLogin("/dashboard");
      await signUpWithGoogle();
    } catch {
      setError("Failed to connect to Google. Please try again.");
      setLoading(null);
    }
  }

  async function handleMicrosoftSignup() {
    if (!role) return;
    setLoading("microsoft");
    setError(null);

    try {
      const cleared = await ensureSignedOut();
      if (!cleared) {
        setError("Could not clear existing session. Please refresh and try again.");
        setLoading(null);
        return;
      }
      setExistingEmail(null);

      storeSignupRole(role);
      storeLead();
      storeRedirectAfterLogin("/dashboard");
      await signUpWithMicrosoft();
    } catch {
      setError("Failed to connect to Microsoft. Please try again.");
      setLoading(null);
    }
  }

  const inputClass = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary/30 transition-colors";
  const selectClass = `${inputClass} cursor-pointer`;

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black-primary">Join Vending Connector</h1>
          <p className="text-black-primary/60 mt-2">
            {step === 1
              ? "Select your role to get started"
              : step === 2
              ? "Tell us about your business"
              : "Connect your account to continue"}
          </p>
        </div>

        {/* Existing session banner */}
        {existingEmail && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm text-amber-800">
              You&apos;re currently signed in as <strong>{existingEmail}</strong>.
            </p>
            <button
              type="button"
              onClick={handleSignOutAndContinue}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 border border-amber-300 transition-colors hover:bg-amber-100 cursor-pointer disabled:opacity-50"
            >
              {signingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              Sign out &amp; continue
            </button>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {/* Error alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Role Selection */}
          {step === 1 && (
            <div className="space-y-4">
              {roles.map(({ value, label, icon: Icon, description }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleRoleSelect(value)}
                  className={`w-full flex items-start gap-4 p-5 rounded-xl border-2 transition-all duration-200
                    text-left cursor-pointer group ${
                      role === value
                        ? "border-green-primary bg-light-warm/50"
                        : "border-gray-100 hover:border-green-primary hover:bg-light-warm/50"
                    }`}
                >
                  <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center
                    transition-colors ${
                      role === value
                        ? "bg-green-primary/10"
                        : "bg-light-warm group-hover:bg-green-primary/10"
                    }`}>
                    <Icon className="w-6 h-6 text-green-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-black-primary">{label}</p>
                    <p className="text-sm text-black-primary/60 mt-0.5">{description}</p>
                  </div>
                </button>
              ))}

              <button
                type="button"
                onClick={handleContinueToInfo}
                disabled={!role}
                className="w-full py-3 px-4 bg-green-primary hover:bg-green-hover text-white
                  font-semibold rounded-xl transition-colors disabled:opacity-40
                  disabled:cursor-not-allowed mt-2 cursor-pointer"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Business & Contact Info */}
          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => { setStep(1); setError(null); }}
                className="flex items-center gap-1.5 text-sm text-black-primary/60 hover:text-green-primary transition-colors mb-6 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Change role
              </button>

              <div className="flex items-center gap-2 mb-6 px-3 py-2 bg-light-warm rounded-lg w-fit">
                {(() => {
                  const selected = roles.find((r) => r.value === role);
                  if (!selected) return null;
                  const Icon = selected.icon;
                  return (
                    <>
                      <Icon className="w-4 h-4 text-green-primary" />
                      <span className="text-sm font-medium text-black-primary">{selected.label}</span>
                    </>
                  );
                })()}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Business Name *</label>
                  <input value={leadForm.business_name} onChange={(e) => setLeadForm((f) => ({ ...f, business_name: e.target.value }))} placeholder="Your business name" className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact Name *</label>
                    <input value={leadForm.contact_name} onChange={(e) => setLeadForm((f) => ({ ...f, contact_name: e.target.value }))} placeholder="Full name" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Phone *</label>
                    <input value={leadForm.phone} onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" type="tel" className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                  <input value={leadForm.address} onChange={(e) => setLeadForm((f) => ({ ...f, address: e.target.value }))} placeholder="Street address" className={inputClass} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">City <span className="text-red-500">*</span></label>
                    <input value={leadForm.city} onChange={(e) => setLeadForm((f) => ({ ...f, city: e.target.value }))} placeholder="City" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">State <span className="text-red-500">*</span></label>
                    <input value={leadForm.state} onChange={(e) => setLeadForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))} placeholder="e.g. TX" maxLength={2} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Zip Code <span className="text-red-500">*</span></label>
                    <input value={leadForm.zip} onChange={(e) => setLeadForm((f) => ({ ...f, zip: e.target.value }))} placeholder="e.g. 75001" maxLength={10} className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                    <select value={leadForm.entity_type} onChange={(e) => setLeadForm((f) => ({ ...f, entity_type: e.target.value }))} className={selectClass}>
                      <option value="">Select type...</option>
                      {ENTITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Immediate Need</label>
                    <select value={leadForm.immediate_need} onChange={(e) => setLeadForm((f) => ({ ...f, immediate_need: e.target.value }))} className={selectClass}>
                      <option value="">Select need...</option>
                      {IMMEDIATE_NEEDS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleContinueToAuth}
                  className="w-full py-3 px-4 bg-green-primary hover:bg-green-hover text-white
                    font-semibold rounded-xl transition-colors mt-2 cursor-pointer"
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 3: OAuth */}
          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => { setStep(2); setError(null); }}
                className="flex items-center gap-1.5 text-sm text-black-primary/60 hover:text-green-primary
                  transition-colors mb-6 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to details
              </button>

              <div className="flex items-center gap-2 mb-6 px-3 py-2 bg-light-warm rounded-lg w-fit">
                {(() => {
                  const selected = roles.find((r) => r.value === role);
                  if (!selected) return null;
                  const Icon = selected.icon;
                  return (
                    <>
                      <Icon className="w-4 h-4 text-green-primary" />
                      <span className="text-sm font-medium text-black-primary">{selected.label}</span>
                      <span className="text-xs text-black-primary/40 ml-1">· {leadForm.business_name}</span>
                    </>
                  );
                })()}
              </div>

              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={handleGoogleSignup}
                disabled={!!loading}
                className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700
                  font-semibold rounded-xl transition-colors disabled:opacity-50
                  disabled:cursor-not-allowed flex items-center justify-center gap-3
                  cursor-pointer border border-gray-300 shadow-sm"
              >
                {loading === "google" ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Connecting to Google...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Sign up with Google
                  </>
                )}
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or</span></div>
              </div>

              {/* Microsoft OAuth Button */}
              <button
                type="button"
                onClick={handleMicrosoftSignup}
                disabled={!!loading}
                className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700
                  font-semibold rounded-xl transition-colors disabled:opacity-50
                  disabled:cursor-not-allowed flex items-center justify-center gap-3
                  cursor-pointer border border-gray-300 shadow-sm"
              >
                {loading === "microsoft" ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Connecting to Microsoft...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 21 21">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                    </svg>
                    Sign up with Microsoft
                  </>
                )}
              </button>

              <div className="mt-4 text-center">
                <p className="text-xs text-black-primary/40">
                  By signing up, you agree to our Terms of Service and Privacy Policy.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer link */}
        <p className="text-center mt-6 text-sm text-black-primary/60">
          Already have an account?{" "}
          <Link href="/login" className="text-green-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
