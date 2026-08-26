"use client";

/**
 * /payroll/[token] — employee/contractor onboarding wizard.
 *
 * Public route (token IS the credential). Different step set per
 * classification. Save-and-resume on every step-Next. Sensitive
 * fields (SSN / TIN / bank) submit through the encrypted-field
 * pipeline (POST /api/payroll/[token]/save-draft { encrypted }) —
 * server encrypts before persist, browser never sees plaintext
 * again after that step.
 *
 * Mobile-first: single-column, large controls, mobile keyboard
 * hints via inputMode + autoComplete.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, ShieldCheck, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import {
  ACCOUNT_TYPES,
  CLASSIFICATION_LABELS,
  FEDERAL_TAX_CLASSES,
  FILING_STATUSES,
  TIN_TYPES,
} from "@/lib/payroll/constants";

type Classification = "w2_employee" | "1099_contractor";

const W2_STEPS = [
  { key: "personal",       label: "Personal Info" },
  { key: "address",        label: "Address" },
  { key: "employment",     label: "Employment" },
  { key: "federal_tax",    label: "Federal W-4" },
  { key: "state_tax",      label: "State Tax" },
  { key: "direct_deposit", label: "Direct Deposit" },
  { key: "eligibility",    label: "Employment Eligibility" },
  { key: "emergency",      label: "Emergency Contact" },
  { key: "review",         label: "Review & Submit" },
] as const;

const C1099_STEPS = [
  { key: "identity",       label: "Identity" },
  { key: "w9",             label: "W-9 Info" },
  { key: "address",        label: "Address" },
  { key: "direct_deposit", label: "Direct Deposit" },
  { key: "review",         label: "Review & Submit" },
] as const;

interface AdminInfo {
  classification: Classification;
  job_title: string | null;
  department: string | null;
  hire_date: string | null;
  employment_status: string | null;
  pay_type: string | null;
  pay_frequency: string | null;
  company_entity: string | null;
  work_state: string | null;
}

interface WorkerDraft {
  legal_first_name?: string;
  middle_name?: string;
  legal_last_name?: string;
  preferred_name?: string;
  date_of_birth?: string;
  personal_email?: string;
  mobile_phone?: string;
  address_street?: string;
  address_unit?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  filing_status?: string;
  multiple_jobs?: boolean;
  qualifying_children_amt?: number;
  other_dependents_amt?: number;
  other_income_cents?: number;
  deductions_cents?: number;
  exempt?: boolean;
  account_holder_name?: string;
  bank_name?: string;
  account_type?: string;
  business_name?: string;
  federal_tax_class?: string;
  tin_type?: string;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;
  emergency_contact_email?: string;
  ssn_last4?: string;
  routing_last4?: string;
  account_last4?: string;
  tin_last4?: string;
}

interface Loaded {
  admin: AdminInfo;
  worker: WorkerDraft | null;
  saved_sensitive_keys: string[];
  status: string;
}

export default function PayrollWizardPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Draft form state (both admin steps display + worker inputs)
  const [form, setForm] = useState<WorkerDraft>({});
  const [ssn, setSsn] = useState(""); const [ssn2, setSsn2] = useState(""); const [showSsn, setShowSsn] = useState(false);
  const [tin, setTin] = useState("");
  const [routing, setRouting] = useState(""); const [routing2, setRouting2] = useState("");
  const [account, setAccount] = useState(""); const [account2, setAccount2] = useState(""); const [showAcct, setShowAcct] = useState(false);
  const [addlWithhold, setAddlWithhold] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [certified, setCertified] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/${token}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || `Failed (${res.status})`); return; }
      setState(json);
      setForm({ ...(json.worker as WorkerDraft ?? {}) });
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const steps = state?.admin.classification === "1099_contractor" ? C1099_STEPS : W2_STEPS;
  const currentStep = steps[stepIndex];

  async function saveDraft(step: string, nonSensitive?: Record<string, unknown>, encrypted?: Record<string, string>): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch(`/api/payroll/${token}/save-draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, nonSensitive, encrypted }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || `Save failed (${res.status})`); return false; }
      // Clear sensitive input state after successful save
      if (encrypted?.ssn) setSsn(""), setSsn2("");
      if (encrypted?.tin) setTin("");
      if (encrypted?.["bank.routing"]) setRouting(""), setRouting2("");
      if (encrypted?.["bank.account"]) setAccount(""), setAccount2("");
      if (encrypted?.["w4.additional_withholding_cents"]) setAddlWithhold("");
      await load();
      return true;
    } finally { setSaving(false); }
  }

  async function nextStep() {
    const ok = await handleStepSave();
    if (ok) setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }
  function prevStep() { setStepIndex((i) => Math.max(i - 1, 0)); setError(null); }

  async function handleStepSave(): Promise<boolean> {
    if (!currentStep) return false;
    setError(null);
    const s = currentStep.key;
    const enc: Record<string, string> = {};
    const ns: Record<string, unknown> = {};

    if (s === "personal") {
      if (!form.legal_first_name || !form.legal_last_name || !form.date_of_birth) {
        setError("Legal name and date of birth are required."); return false;
      }
      if (state?.admin.classification === "w2_employee") {
        if (ssn || ssn2) {
          if (ssn !== ssn2) { setError("Social Security numbers don't match."); return false; }
          if (!/^\d{9}$/.test(ssn.replace(/[^0-9]/g, ""))) { setError("SSN must be 9 digits."); return false; }
          enc.ssn = ssn.replace(/[^0-9]/g, "");
        } else if (!state?.saved_sensitive_keys.includes("ssn")) {
          setError("Social Security number is required."); return false;
        }
      }
      ns.legal_first_name = form.legal_first_name;
      ns.middle_name = form.middle_name;
      ns.legal_last_name = form.legal_last_name;
      ns.preferred_name = form.preferred_name;
      ns.date_of_birth = form.date_of_birth;
      ns.personal_email = form.personal_email;
      ns.mobile_phone = form.mobile_phone;
      return await saveDraft(s, ns, enc);
    }

    if (s === "identity") {
      if (!form.legal_first_name || !form.legal_last_name) { setError("Legal name is required."); return false; }
      ns.legal_first_name = form.legal_first_name;
      ns.legal_last_name = form.legal_last_name;
      ns.business_name = form.business_name;
      ns.personal_email = form.personal_email;
      ns.mobile_phone = form.mobile_phone;
      return await saveDraft(s, ns);
    }

    if (s === "address") {
      if (!form.address_street || !form.address_city || !form.address_state || !form.address_zip) {
        setError("Street, city, state, and ZIP are required."); return false;
      }
      ns.address_street = form.address_street;
      ns.address_unit = form.address_unit;
      ns.address_city = form.address_city;
      ns.address_state = form.address_state;
      ns.address_zip = form.address_zip;
      ns.address_country = "US";
      return await saveDraft(s, ns);
    }

    if (s === "federal_tax") {
      if (!form.filing_status) { setError("Filing status is required."); return false; }
      ns.filing_status = form.filing_status;
      ns.multiple_jobs = !!form.multiple_jobs;
      ns.qualifying_children_amt = form.qualifying_children_amt ?? null;
      ns.other_dependents_amt = form.other_dependents_amt ?? null;
      ns.other_income_cents = form.other_income_cents ?? null;
      ns.deductions_cents = form.deductions_cents ?? null;
      ns.exempt = !!form.exempt;
      if (addlWithhold) enc["w4.additional_withholding_cents"] = String(Math.round(Number(addlWithhold) * 100));
      return await saveDraft(s, ns, enc);
    }

    if (s === "state_tax" || s === "employment" || s === "eligibility" || s === "emergency") {
      if (s === "emergency") {
        ns.emergency_contact_name = form.emergency_contact_name;
        ns.emergency_contact_relationship = form.emergency_contact_relationship;
        ns.emergency_contact_phone = form.emergency_contact_phone;
        ns.emergency_contact_email = form.emergency_contact_email;
      }
      return await saveDraft(s, ns);
    }

    if (s === "w9") {
      if (!form.federal_tax_class || !form.tin_type) { setError("Tax classification and TIN type are required."); return false; }
      if (tin) {
        const clean = tin.replace(/[^0-9]/g, "");
        if (form.tin_type === "ssn" && clean.length !== 9) { setError("SSN must be 9 digits."); return false; }
        if (form.tin_type === "ein" && clean.length !== 9) { setError("EIN must be 9 digits."); return false; }
        enc.tin = clean;
      } else if (!state?.saved_sensitive_keys.includes("tin")) {
        setError("TIN is required."); return false;
      }
      ns.federal_tax_class = form.federal_tax_class;
      ns.tin_type = form.tin_type;
      ns.business_name = form.business_name;
      return await saveDraft(s, ns, enc);
    }

    if (s === "direct_deposit") {
      if (!form.account_holder_name || !form.bank_name || !form.account_type) {
        setError("Account holder name, bank name, and account type are required."); return false;
      }
      if (routing || routing2) {
        if (routing !== routing2) { setError("Routing numbers don't match."); return false; }
        if (!/^\d{9}$/.test(routing.replace(/[^0-9]/g, ""))) { setError("Routing number must be 9 digits."); return false; }
        enc["bank.routing"] = routing.replace(/[^0-9]/g, "");
      } else if (!state?.saved_sensitive_keys.includes("bank.routing")) {
        setError("Routing number is required."); return false;
      }
      if (account || account2) {
        if (account !== account2) { setError("Account numbers don't match."); return false; }
        if (account.replace(/[^0-9]/g, "").length < 4) { setError("Account number is too short."); return false; }
        enc["bank.account"] = account.replace(/[^0-9]/g, "");
      } else if (!state?.saved_sensitive_keys.includes("bank.account")) {
        setError("Account number is required."); return false;
      }
      ns.account_holder_name = form.account_holder_name;
      ns.bank_name = form.bank_name;
      ns.account_type = form.account_type;
      return await saveDraft(s, ns, enc);
    }

    if (s === "review") return true;
    return true;
  }

  async function submit() {
    if (!signatureName.trim()) { setError("Type your legal name to sign."); return; }
    if (!certified) { setError("Please confirm the certification."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/payroll/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature_name: signatureName.trim(), certified: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || `Submit failed (${res.status})`); return; }
      setDone(true);
    } finally { setSubmitting(false); }
  }

  const savedKeys = useMemo(() => new Set(state?.saved_sensitive_keys ?? []), [state]);

  if (loading) return <Shell><Loader2 className="h-6 w-6 animate-spin text-green-primary mx-auto" /></Shell>;
  if (error && !state) return <Shell><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><AlertCircle className="inline-block h-4 w-4 mr-1" />{error}</div></Shell>;
  if (!state) return null;

  if (done) {
    return (
      <Shell>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-3 text-2xl font-bold text-emerald-900">Payroll Setup Submitted</h1>
          <p className="mt-2 text-sm text-emerald-800">Thank you. Your payroll information has been securely submitted.</p>
          <p className="mt-1 text-sm text-emerald-700">Our payroll team will review your information and complete your payroll setup. If additional information is needed, we will contact you.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-green-primary">Payroll Onboarding</div>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">{CLASSIFICATION_LABELS[state.admin.classification]} · {state.admin.company_entity ?? "—"}</h1>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium ring-1 ring-gray-200 text-gray-700">
          <ShieldCheck className="h-3.5 w-3.5 text-green-primary" /> Secure
        </span>
      </div>

      {/* Progress */}
      <div className="mb-6 grid grid-cols-3 gap-1 sm:grid-cols-9">
        {steps.map((s, i) => (
          <div key={s.key} className={`h-1.5 rounded-full ${i <= stepIndex ? "bg-green-primary" : "bg-gray-200"}`} title={s.label} />
        ))}
      </div>
      <div className="mb-4 text-xs text-gray-500">Step {stepIndex + 1} of {steps.length}: <span className="font-medium text-gray-800">{currentStep.label}</span></div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        {currentStep.key === "personal" && (
          <>
            <TwoCol>
              <Field label="Legal First Name" required autoComplete="given-name" value={form.legal_first_name ?? ""} onChange={(v) => setForm({ ...form, legal_first_name: v })} />
              <Field label="Middle Name" autoComplete="additional-name" value={form.middle_name ?? ""} onChange={(v) => setForm({ ...form, middle_name: v })} />
            </TwoCol>
            <TwoCol>
              <Field label="Legal Last Name" required autoComplete="family-name" value={form.legal_last_name ?? ""} onChange={(v) => setForm({ ...form, legal_last_name: v })} />
              <Field label="Preferred Name" value={form.preferred_name ?? ""} onChange={(v) => setForm({ ...form, preferred_name: v })} />
            </TwoCol>
            <TwoCol>
              <Field label="Date of Birth" required type="date" autoComplete="bday" value={form.date_of_birth ?? ""} onChange={(v) => setForm({ ...form, date_of_birth: v })} />
              <Field label="Personal Email" type="email" autoComplete="email" value={form.personal_email ?? ""} onChange={(v) => setForm({ ...form, personal_email: v })} />
            </TwoCol>
            <Field label="Mobile Phone" type="tel" autoComplete="tel" inputMode="tel" value={form.mobile_phone ?? ""} onChange={(v) => setForm({ ...form, mobile_phone: v })} />
            {state.admin.classification === "w2_employee" && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><ShieldCheck className="h-4 w-4" /> Social Security Number</div>
                {savedKeys.has("ssn") ? (
                  <div className="text-xs text-amber-800">On file. Enter a new value only if you need to replace it — otherwise leave blank and continue.</div>
                ) : null}
                <SensitiveField label="SSN"          value={ssn}  show={showSsn} onToggle={() => setShowSsn(!showSsn)} onChange={setSsn}  inputMode="numeric" />
                <SensitiveField label="Confirm SSN"  value={ssn2} show={showSsn} onToggle={() => setShowSsn(!showSsn)} onChange={setSsn2} inputMode="numeric" />
              </div>
            )}
          </>
        )}

        {currentStep.key === "identity" && (
          <>
            <TwoCol>
              <Field label="Legal First Name" required value={form.legal_first_name ?? ""} onChange={(v) => setForm({ ...form, legal_first_name: v })} />
              <Field label="Legal Last Name"  required value={form.legal_last_name ?? ""}  onChange={(v) => setForm({ ...form, legal_last_name: v })} />
            </TwoCol>
            <Field label="Business / Entity Name (if applicable)" value={form.business_name ?? ""} onChange={(v) => setForm({ ...form, business_name: v })} />
            <TwoCol>
              <Field label="Email" type="email" autoComplete="email" value={form.personal_email ?? ""} onChange={(v) => setForm({ ...form, personal_email: v })} />
              <Field label="Phone" type="tel" inputMode="tel" value={form.mobile_phone ?? ""} onChange={(v) => setForm({ ...form, mobile_phone: v })} />
            </TwoCol>
          </>
        )}

        {currentStep.key === "address" && (
          <>
            <Field label="Street Address" required autoComplete="street-address" value={form.address_street ?? ""} onChange={(v) => setForm({ ...form, address_street: v })} />
            <TwoCol>
              <Field label="Apt / Unit" value={form.address_unit ?? ""} onChange={(v) => setForm({ ...form, address_unit: v })} />
              <Field label="City" required autoComplete="address-level2" value={form.address_city ?? ""} onChange={(v) => setForm({ ...form, address_city: v })} />
            </TwoCol>
            <TwoCol>
              <Field label="State" required autoComplete="address-level1" value={form.address_state ?? ""} onChange={(v) => setForm({ ...form, address_state: v })} />
              <Field label="ZIP" required autoComplete="postal-code" inputMode="numeric" value={form.address_zip ?? ""} onChange={(v) => setForm({ ...form, address_zip: v })} />
            </TwoCol>
          </>
        )}

        {currentStep.key === "employment" && (
          <div className="space-y-3 text-sm">
            <p className="text-gray-500 text-xs">These fields were set by your administrator and can&apos;t be edited here. If something looks wrong, contact your manager.</p>
            <ReadOnly label="Company"          value={state.admin.company_entity ?? "—"} />
            <ReadOnly label="Position"         value={state.admin.job_title ?? "—"} />
            <ReadOnly label="Department"       value={state.admin.department ?? "—"} />
            <ReadOnly label="Hire Date"        value={state.admin.hire_date ? new Date(state.admin.hire_date).toLocaleDateString() : "—"} />
            <ReadOnly label="Employment Status" value={state.admin.employment_status ?? "—"} />
            <ReadOnly label="Pay Type"         value={state.admin.pay_type ?? "—"} />
            <ReadOnly label="Pay Frequency"    value={state.admin.pay_frequency ?? "—"} />
          </div>
        )}

        {currentStep.key === "federal_tax" && (
          <>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Filing Status <span className="text-red-500">*</span></span>
              <select value={form.filing_status ?? ""} onChange={(e) => setForm({ ...form, filing_status: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">Select…</option>
                {FILING_STATUSES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.multiple_jobs} onChange={(e) => setForm({ ...form, multiple_jobs: e.target.checked })} />
              <span>I have multiple jobs OR my spouse works</span>
            </label>
            <TwoCol>
              <Field label="Qualifying children ($)"     type="number" inputMode="numeric" value={String(form.qualifying_children_amt ?? "")} onChange={(v) => setForm({ ...form, qualifying_children_amt: v ? Number(v) : undefined })} />
              <Field label="Other dependents ($)"        type="number" inputMode="numeric" value={String(form.other_dependents_amt ?? "")} onChange={(v) => setForm({ ...form, other_dependents_amt: v ? Number(v) : undefined })} />
              <Field label="Other income (annual $)"     type="number" inputMode="numeric" value={String(form.other_income_cents ? form.other_income_cents / 100 : "")} onChange={(v) => setForm({ ...form, other_income_cents: v ? Math.round(Number(v) * 100) : undefined })} />
              <Field label="Deductions ($)"              type="number" inputMode="numeric" value={String(form.deductions_cents ? form.deductions_cents / 100 : "")} onChange={(v) => setForm({ ...form, deductions_cents: v ? Math.round(Number(v) * 100) : undefined })} />
            </TwoCol>
            <Field label="Additional withholding per pay period ($) — encrypted at rest" type="number" inputMode="numeric" value={addlWithhold} onChange={setAddlWithhold} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.exempt} onChange={(e) => setForm({ ...form, exempt: e.target.checked })} />
              <span>I qualify for exempt withholding</span>
            </label>
            <p className="text-xs text-gray-500">
              Vending Connector does not provide tax advice. If you are unsure how to complete your withholding elections, consult a qualified tax professional.
            </p>
          </>
        )}

        {currentStep.key === "state_tax" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold mb-1">State withholding</div>
            <p>Work state on file: <strong>{state.admin.work_state ?? "—"}</strong>.</p>
            <p className="mt-2">State-specific withholding forms are handled separately by your payroll administrator after you submit this packet. No additional entry is required from you here for now.</p>
          </div>
        )}

        {currentStep.key === "direct_deposit" && (
          <>
            <Field label="Account Holder Name" required autoComplete="name" value={form.account_holder_name ?? ""} onChange={(v) => setForm({ ...form, account_holder_name: v })} />
            <Field label="Bank Name" required value={form.bank_name ?? ""} onChange={(v) => setForm({ ...form, bank_name: v })} />
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Account Type <span className="text-red-500">*</span></span>
              <select value={form.account_type ?? ""} onChange={(e) => setForm({ ...form, account_type: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">Select…</option>
                {ACCOUNT_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><ShieldCheck className="h-4 w-4" /> Bank Details (encrypted)</div>
              {savedKeys.has("bank.routing") && savedKeys.has("bank.account") ? (
                <div className="text-xs text-amber-800">Routing + account on file. Enter new values only if you need to replace them.</div>
              ) : null}
              <SensitiveField label="Routing Number"          value={routing}  onChange={setRouting}  inputMode="numeric" />
              <SensitiveField label="Confirm Routing Number"  value={routing2} onChange={setRouting2} inputMode="numeric" />
              <SensitiveField label="Account Number"          value={account}  show={showAcct} onToggle={() => setShowAcct(!showAcct)} onChange={setAccount}  inputMode="numeric" />
              <SensitiveField label="Confirm Account Number"  value={account2} show={showAcct} onToggle={() => setShowAcct(!showAcct)} onChange={setAccount2} inputMode="numeric" />
            </div>
            <p className="text-xs text-gray-500">
              By continuing, you authorize Vending Connector / Apex AI Vending and its payroll provider to electronically deposit payroll into the specified account and make correcting entries when legally appropriate.
            </p>
          </>
        )}

        {currentStep.key === "w9" && (
          <>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Federal Tax Classification <span className="text-red-500">*</span></span>
              <select value={form.federal_tax_class ?? ""} onChange={(e) => setForm({ ...form, federal_tax_class: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">Select…</option>
                {FEDERAL_TAX_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">TIN Type <span className="text-red-500">*</span></span>
              <select value={form.tin_type ?? ""} onChange={(e) => setForm({ ...form, tin_type: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">Select…</option>
                {TIN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><ShieldCheck className="h-4 w-4" /> Taxpayer Identification Number</div>
              {savedKeys.has("tin") ? (
                <div className="text-xs text-amber-800">On file. Enter a new value only if you need to replace it.</div>
              ) : null}
              <SensitiveField label="TIN (9 digits)" value={tin} onChange={setTin} inputMode="numeric" />
            </div>
          </>
        )}

        {currentStep.key === "eligibility" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold mb-1">Form I-9 — Employment Eligibility</div>
            <p>Your administrator will guide the I-9 process after you submit this packet. Please have valid identity + employment authorization documents ready to present in person or via the workflow they send you.</p>
          </div>
        )}

        {currentStep.key === "emergency" && (
          <>
            <TwoCol>
              <Field label="Emergency Contact Name" value={form.emergency_contact_name ?? ""} onChange={(v) => setForm({ ...form, emergency_contact_name: v })} />
              <Field label="Relationship"           value={form.emergency_contact_relationship ?? ""} onChange={(v) => setForm({ ...form, emergency_contact_relationship: v })} />
            </TwoCol>
            <TwoCol>
              <Field label="Phone" type="tel" inputMode="tel" value={form.emergency_contact_phone ?? ""} onChange={(v) => setForm({ ...form, emergency_contact_phone: v })} />
              <Field label="Email" type="email"               value={form.emergency_contact_email ?? ""} onChange={(v) => setForm({ ...form, emergency_contact_email: v })} />
            </TwoCol>
          </>
        )}

        {currentStep.key === "review" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">Please review the information below. Sensitive values are shown masked — the full values remain encrypted server-side.</p>
            <ReviewRow k="Legal Name"    v={[form.legal_first_name, form.middle_name, form.legal_last_name].filter(Boolean).join(" ") || "—"} />
            {state.admin.classification === "w2_employee" && <ReviewRow k="Date of Birth" v={form.date_of_birth ?? "—"} />}
            <ReviewRow k="Address" v={form.address_street ? `${form.address_street}, ${form.address_city}, ${form.address_state} ${form.address_zip}` : "—"} />
            {state.admin.classification === "w2_employee" ? (
              <>
                <ReviewRow k="SSN" v={form.ssn_last4 ? `***-**-${form.ssn_last4}` : "—"} />
                <ReviewRow k="Filing Status" v={form.filing_status ?? "—"} />
              </>
            ) : (
              <>
                <ReviewRow k="Business Name" v={form.business_name ?? "—"} />
                <ReviewRow k="Federal Tax Class" v={form.federal_tax_class ?? "—"} />
                <ReviewRow k="TIN" v={form.tin_last4 ? `***-**-${form.tin_last4}` : "—"} />
              </>
            )}
            <ReviewRow k="Bank" v={form.bank_name ? `${form.bank_name} (${form.account_type})` : "—"} />
            <ReviewRow k="Routing" v={form.routing_last4 ? `••••${form.routing_last4}` : "—"} />
            <ReviewRow k="Account" v={form.account_last4 ? `••••••${form.account_last4}` : "—"} />

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <Field label="Type your legal name to sign" required value={signatureName} onChange={setSignatureName} />
              <label className="flex items-start gap-2 text-sm text-emerald-900">
                <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} className="mt-1" />
                <span>I certify that the information I have provided is complete and accurate to the best of my knowledge.</span>
              </label>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
          <button type="button" disabled={stepIndex === 0 || saving || submitting} onClick={prevStep} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          {currentStep.key === "review" ? (
            <button type="button" onClick={submit} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-green-primary px-5 py-2 text-sm font-semibold text-white hover:bg-green-hover disabled:opacity-50">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <>Submit Packet <CheckCircle2 className="h-4 w-4" /></>}
            </button>
          ) : (
            <button type="button" onClick={nextStep} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white hover:bg-green-hover disabled:opacity-50">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>Save & Continue <ChevronRight className="h-4 w-4" /></>}
            </button>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-gray-500">Vending Connector — payroll setup · your data is transmitted over HTTPS and encrypted at rest.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-light-warm to-white py-10">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">{children}</div>
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({ label, value, onChange, required, type = "text", autoComplete, inputMode, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean;
  type?: string; autoComplete?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}{required && <span className="text-red-500"> *</span>}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} inputMode={inputMode} placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base text-gray-900" />
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function SensitiveField({ label, value, onChange, show, onToggle, inputMode }: {
  label: string; value: string; onChange: (v: string) => void;
  show?: boolean; onToggle?: () => void; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <div className="relative">
        <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete="off" spellCheck={false} inputMode={inputMode}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 pr-9 text-base font-mono text-gray-900" />
        {onToggle && (
          <button type="button" onClick={onToggle} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100" aria-label={show ? "Hide" : "Show"}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </label>
  );
}

function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-2 text-sm">
      <span className="text-gray-500">{k}</span>
      <span className="font-medium text-gray-900 text-right">{v}</span>
    </div>
  );
}
