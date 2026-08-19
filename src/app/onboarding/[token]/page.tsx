"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  FileSignature,
  Cloud,
  CloudOff,
  Upload,
  FileText,
  ShieldCheck,
  ClipboardCheck,
  DollarSign,
  Landmark,
  AlertCircle,
} from "lucide-react";
import { useDebouncedAutosave, type SaveState } from "@/hooks/useDebouncedAutosave";
import {
  INDEPENDENT_CONTRACTOR_AGREEMENT,
  CONFIDENTIALITY_AGREEMENT,
  SALES_POLICY_ACKNOWLEDGMENTS,
  COMMISSION_SCHEDULE,
} from "@/lib/contractorOnboarding/legal";

/**
 * Public contractor onboarding portal.
 *
 * Authorized by knowledge of the raw token in the URL — server
 * verifies via SHA-256 hash + constant-time comparison and stamps
 * status transitions (opened → in_progress → completed).
 *
 * Step 1 is fully wired in this commit; steps 2–7 render as
 * placeholder stubs so the shell + navigation + autosave loop can
 * be smoke-tested end-to-end. Legal + signature steps land in
 * commits 4–6.
 */

const STEPS = [
  "Contractor Information",
  "Tax Information",
  "Contractor Agreement",
  "Confidentiality",
  "Sales Policies",
  "Compensation",
  "Payment",
  "Review & Sign",
] as const;

interface StepData {
  // Step 1 — Contractor Information
  full_legal_name?: string;
  preferred_name?: string;
  business_name?: string;
  mailing_address?: string;
  mailing_city?: string;
  mailing_state?: string;
  mailing_zip?: string;
  phone_number?: string;
  state_of_residence?: string;
  // Step 3–5 — agreement acknowledgments (real signatures happen at step 8)
  ica_accepted?: boolean;
  confidentiality_accepted?: boolean;
  sales_policy_acknowledgments?: Record<string, boolean>;
  // Step 6 — compensation acknowledgment
  commission_acknowledged?: boolean;
  // Step 7 — payment info (non-sensitive metadata only; the actual
  // bank credentials live server-side as a Dwolla funding source URL)
  payee_legal_name?: string;
  contractor_business_name?: string;
}

interface OnboardingState {
  id: string;
  contractor_email: string;
  contractor_name: string | null;
  start_date: string;
  status: string;
  step_data: StepData;
  current_step: number;
  agreement_version: string;
  completed_at: string | null;
  locked: boolean;
  w9_received: boolean;
  w9_original_filename?: string | null;
  payment_verified: boolean;
}

export default function ContractorOnboardingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; expired?: boolean } | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);

  const apiUrl = useMemo(() => `/api/onboarding/contractor/${token}`, [token]);

  const { queue, flush, saveState } = useDebouncedAutosave<{
    step_data?: StepData;
    current_step?: number;
  }>({
    save: async (patch) => {
      const res = await fetch(apiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.onboarding) setState(data.onboarding);
    },
  });

  // Initial fetch — also transitions status server-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!cancelled) {
            setLoadError({
              message: data.error ?? `Unable to load onboarding (HTTP ${res.status}).`,
              expired: !!data.expired,
            });
          }
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setState(data.onboarding);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError({
            message: err instanceof Error ? err.message : "Network error",
          });
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light">
        <div className="text-center text-gray-500 text-sm">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-green-600" />
          Loading your onboarding…
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light px-4">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {loadError.expired ? "Onboarding Link Expired" : "Onboarding Not Available"}
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            {loadError.expired
              ? "This onboarding link has expired. Please contact Apex AI Vending for a new invitation."
              : loadError.message}
          </p>
          <p className="mt-6 text-xs text-gray-400">
            Contact <a href="mailto:anthony.heidal@apexaivending.com" className="text-green-600 hover:underline">anthony.heidal@apexaivending.com</a>
          </p>
        </div>
      </div>
    );
  }

  if (!state) return null;

  // Completed / locked view — no editable content.
  if (state.locked || state.status === "completed") {
    return <CompletedView state={state} />;
  }

  const stepIndex = Math.min(Math.max(state.current_step - 1, 0), STEPS.length - 1);

  function updateField<K extends keyof StepData>(key: K, value: StepData[K]) {
    setState((prev) =>
      prev ? { ...prev, step_data: { ...prev.step_data, [key]: value } } : prev,
    );
    queue({ step_data: { [key]: value } as Partial<StepData> });
  }

  async function goToStep(next: number) {
    await flush();
    const clamped = Math.min(Math.max(next, 1), STEPS.length);
    setState((prev) => (prev ? { ...prev, current_step: clamped } : prev));
    queue({ current_step: clamped });
    // Scroll to top for the new step.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-light">
      <Header state={state} saveState={saveState} />

      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <ProgressBar currentStep={state.current_step} />

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-green-600">
              Step {state.current_step} of {STEPS.length}
            </p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">
              {STEPS[stepIndex]}
            </h2>
          </div>

          <div className="px-6 py-6">
            {state.current_step === 1 && (
              <ContractorInfoStep state={state} updateField={updateField} />
            )}
            {state.current_step === 2 && (
              <W9UploadStep state={state} token={token} onUploaded={setState} />
            )}
            {state.current_step === 3 && (
              <ContractorAgreementStep state={state} updateField={updateField} />
            )}
            {state.current_step === 4 && (
              <ConfidentialityStep state={state} updateField={updateField} />
            )}
            {state.current_step === 5 && (
              <SalesPolicyStep state={state} updateField={updateField} />
            )}
            {state.current_step === 6 && (
              <CompensationStep state={state} updateField={updateField} />
            )}
            {state.current_step === 7 && (
              <PaymentStep state={state} token={token} updateField={updateField} onVerified={setState} />
            )}
            {state.current_step === 8 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                Review & Sign ships in the next commit. Your progress on earlier steps is
                autosaved — use the Back button to review or edit any time.
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between rounded-b-2xl">
            <button
              type="button"
              onClick={() => goToStep(state.current_step - 1)}
              disabled={state.current_step === 1}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={() => goToStep(state.current_step + 1)}
              disabled={state.current_step >= STEPS.length}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header — branded shell with autosave indicator
// ─────────────────────────────────────────────────────────────

function Header({ state, saveState }: { state: OnboardingState; saveState: SaveState }) {
  const startDate = new Date(state.start_date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <header className="bg-white border-b border-gray-100">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-green-600">
          Vending Connector · Apex AI Vending
        </p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
              Welcome to the Team
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Congratulations! You&apos;ve been selected as a <strong>Vice President</strong> with Vending Connector / Apex AI Vending LLP.
            </p>
            <p className="mt-2 text-sm text-gray-800">
              <span className="font-semibold">Start Date:</span> {startDate}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Please complete the required onboarding documents below before your start date.
            </p>
          </div>
          <SaveIndicator state={saveState} />
        </div>
      </div>
    </header>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saved") {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Saved
      </span>
    );
  }
  if (state === "saving") {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
        <Cloud className="h-3.5 w-3.5" /> Saving…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">
        <CloudOff className="h-3.5 w-3.5" /> Not saved
      </span>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────────────────────

function ProgressBar({ currentStep }: { currentStep: number }) {
  const pct = Math.min(100, Math.round((currentStep / STEPS.length) * 100));
  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
        <span className="font-medium">{STEPS[Math.min(currentStep - 1, STEPS.length - 1)]}</span>
        <span>{currentStep} of {STEPS.length}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full bg-green-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 1 — Contractor Information
// ─────────────────────────────────────────────────────────────

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

function ContractorInfoStep({
  state,
  updateField,
}: {
  state: OnboardingState;
  updateField: <K extends keyof StepData>(key: K, value: StepData[K]) => void;
}) {
  const s = state.step_data;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Tell us how to identify you on tax forms, agreements, and CRM records. Fields
        marked <span className="text-red-500">*</span> are required.
      </p>

      <Field label="Full Legal Name" required>
        <input
          type="text"
          value={s.full_legal_name ?? ""}
          onChange={(e) => updateField("full_legal_name", e.target.value)}
          className={inputClass}
          placeholder="Legal name as it appears on your ID"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Preferred Name">
          <input
            type="text"
            value={s.preferred_name ?? ""}
            onChange={(e) => updateField("preferred_name", e.target.value)}
            className={inputClass}
            placeholder="If different from legal name"
          />
        </Field>
        <Field label="Business / LLC Name">
          <input
            type="text"
            value={s.business_name ?? ""}
            onChange={(e) => updateField("business_name", e.target.value)}
            className={inputClass}
            placeholder="Optional"
          />
        </Field>
      </div>

      <Field label="Mailing Address" required>
        <input
          type="text"
          value={s.mailing_address ?? ""}
          onChange={(e) => updateField("mailing_address", e.target.value)}
          className={inputClass}
          placeholder="Street address"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="City" required>
          <input
            type="text"
            value={s.mailing_city ?? ""}
            onChange={(e) => updateField("mailing_city", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="State" required>
          <select
            value={s.mailing_state ?? ""}
            onChange={(e) => updateField("mailing_state", e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {US_STATES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </Field>
        <Field label="ZIP" required>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{5}(-\d{4})?"
            value={s.mailing_zip ?? ""}
            onChange={(e) => updateField("mailing_zip", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Primary Email">
          <input
            type="email"
            value={state.contractor_email}
            disabled
            className={`${inputClass} bg-gray-50 text-gray-500`}
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Prefilled from your invitation. Contact your admin to change it.
          </p>
        </Field>
        <Field label="Phone Number" required>
          <input
            type="tel"
            value={s.phone_number ?? ""}
            onChange={(e) => updateField("phone_number", e.target.value)}
            className={inputClass}
            placeholder="(555) 555-5555"
          />
        </Field>
      </div>

      <Field label="State of Residence" required>
        <select
          value={s.state_of_residence ?? ""}
          onChange={(e) => updateField("state_of_residence", e.target.value)}
          className={inputClass}
        >
          <option value="">Select…</option>
          {US_STATES.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </Field>

      <Field label="Start Date">
        <input
          type="date"
          value={state.start_date}
          disabled
          className={`${inputClass} bg-gray-50 text-gray-500`}
        />
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Field + input shared classes
// ─────────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-600">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 2 — Tax Information (W-9 upload)
// ─────────────────────────────────────────────────────────────

function W9UploadStep({
  state,
  token,
  onUploaded,
}: {
  state: OnboardingState;
  token: string;
  onUploaded: (updater: (prev: OnboardingState | null) => OnboardingState | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("File exceeds 15 MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/onboarding/contractor/${token}/w9`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Upload failed (HTTP ${res.status})`);
      } else {
        onUploaded((prev) =>
          prev
            ? {
                ...prev,
                w9_received: true,
                w9_original_filename: data.w9_original_filename,
              }
            : prev,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setUploading(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 leading-relaxed">
        We need a completed IRS Form W-9 on file for tax reporting. Download the
        current form from{" "}
        <a
          href="https://www.irs.gov/pub/irs-pdf/fw9.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-600 hover:underline font-medium"
        >
          IRS.gov
        </a>
        , fill it out and sign it, then upload the completed PDF below.
      </p>
      <p className="text-xs text-gray-500 leading-relaxed">
        Your W-9 is uploaded to a secure, private location and is not visible in
        our team views or notification emails. Only authorized finance staff can
        access it.
      </p>

      {state.w9_received ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">W-9 received</p>
              <p className="text-xs text-gray-600 mt-1 truncate">
                {state.w9_original_filename ?? "Uploaded"}
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
              >
                <Upload className="h-3.5 w-3.5" />
                Replace W-9
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor="w9-file"
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
            uploading
              ? "border-gray-200 bg-gray-50"
              : "border-green-300 bg-green-50/40 hover:bg-green-50"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-green-600" />
              <p className="text-sm text-gray-600">Uploading…</p>
            </>
          ) : (
            <>
              <Upload className="h-6 w-6 text-green-600" />
              <p className="text-sm font-medium text-gray-900">
                Click to upload your completed W-9
              </p>
              <p className="text-[11px] text-gray-500">PDF only, max 15 MB</p>
            </>
          )}
        </label>
      )}
      <input
        ref={inputRef}
        id="w9-file"
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 3 — Independent Contractor Agreement
// ─────────────────────────────────────────────────────────────

function ContractorAgreementStep({
  state,
  updateField,
}: {
  state: OnboardingState;
  updateField: <K extends keyof StepData>(key: K, value: StepData[K]) => void;
}) {
  const a = INDEPENDENT_CONTRACTOR_AGREEMENT;
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Please review the Independent Contractor Agreement below. You&apos;ll be
        asked to sign it electronically at the end of onboarding — this step
        confirms you&apos;ve read and agree with the terms.
      </p>

      <div className="rounded-xl border border-gray-200 bg-white max-h-[420px] overflow-y-auto p-5 text-sm text-gray-700 space-y-4">
        <Section title="Services">
          <BulletList items={a.scopeOfServices} />
        </Section>
        <Section title="Authorized Representations — Contractor may communicate:">
          <BulletList items={a.authorizedRepresentations.may} />
        </Section>
        <Section title="Contractor may NOT:">
          <BulletList items={a.authorizedRepresentations.mayNot} />
        </Section>
        <Section title="Independent Contractor Status (1099)">
          <BulletList items={a.independentContractorStatus} />
        </Section>
        <Section title="No Non-Compete">
          <p className="leading-relaxed">{a.noNonCompete}</p>
        </Section>
        <Section title="CRM Requirements">
          <BulletList items={a.crmRequirements} />
        </Section>
      </div>

      <CheckboxRow
        label="I have read and agree to the Independent Contractor Agreement above."
        checked={!!state.step_data.ica_accepted}
        onChange={(v) => updateField("ica_accepted", v)}
        icon={FileText}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 4 — Confidentiality & Customer Data
// ─────────────────────────────────────────────────────────────

function ConfidentialityStep({
  state,
  updateField,
}: {
  state: OnboardingState;
  updateField: <K extends keyof StepData>(key: K, value: StepData[K]) => void;
}) {
  const c = CONFIDENTIALITY_AGREEMENT;
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        This agreement covers how you use and protect Vending Connector /
        Apex AI Vending customer and company information — during your
        engagement and after it ends.
      </p>

      <div className="rounded-xl border border-gray-200 bg-white max-h-[420px] overflow-y-auto p-5 text-sm text-gray-700 space-y-4">
        <Section title="What you agree to">
          <BulletList items={c.restrictions} />
        </Section>
        <Section title="Prohibited storage locations for customer data">
          <BulletList items={c.prohibitedStorageLocations} />
        </Section>
        <Section title="Data deletion upon termination or Company request">
          <BulletList items={c.dataDeletionOnTermination} />
        </Section>
        <Section title="Acknowledgment">
          <p className="italic text-gray-700 leading-relaxed">{c.acknowledgment}</p>
        </Section>
      </div>

      <CheckboxRow
        label="I have read and agree to the Confidentiality & Customer Data Agreement above."
        checked={!!state.step_data.confidentiality_accepted}
        onChange={(v) => updateField("confidentiality_accepted", v)}
        icon={ShieldCheck}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 5 — Sales / CRM Policy — individual acknowledgments
// ─────────────────────────────────────────────────────────────

function SalesPolicyStep({
  state,
  updateField,
}: {
  state: OnboardingState;
  updateField: <K extends keyof StepData>(key: K, value: StepData[K]) => void;
}) {
  const acks = state.step_data.sales_policy_acknowledgments ?? {};
  const remaining = SALES_POLICY_ACKNOWLEDGMENTS.filter((a) => !acks[a]).length;

  function toggle(item: string, next: boolean) {
    updateField("sales_policy_acknowledgments", { ...acks, [item]: next });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Please check each acknowledgment. Every item must be checked before you
        can continue — this is the sales, customer support, and CRM policy you
        agree to operate under.
      </p>

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {SALES_POLICY_ACKNOWLEDGMENTS.map((item) => {
          const checked = !!acks[item];
          return (
            <label
              key={item}
              className={`flex items-start gap-3 p-4 cursor-pointer transition-colors ${
                checked ? "bg-green-50/60" : "hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => toggle(item, e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
              />
              <span className={`text-sm ${checked ? "text-gray-700" : "text-gray-900"}`}>
                {item}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <ClipboardCheck className="h-3.5 w-3.5" />
        {remaining === 0
          ? "All acknowledgments complete."
          : `${remaining} of ${SALES_POLICY_ACKNOWLEDGMENTS.length} remaining.`}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 6 — Compensation (Commission Schedule display + acknowledgment)
// ─────────────────────────────────────────────────────────────

function CompensationStep({
  state,
  updateField,
}: {
  state: OnboardingState;
  updateField: <K extends keyof StepData>(key: K, value: StepData[K]) => void;
}) {
  const cs = COMMISSION_SCHEDULE;
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        This is the commission schedule you&apos;ll be paid under. Review it
        carefully — the terms below are what governs how commissions are earned,
        the Friday payment cycle, and how refunds are reconciled.
      </p>

      {/* Commission tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cs.items.map((item) => (
          <div
            key={item.key}
            className="rounded-xl border border-green-200 bg-gradient-to-br from-green-50/60 to-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600 shrink-0" />
              <h4 className="text-sm font-bold text-gray-900">{item.label}</h4>
            </div>
            <p className="mt-2 text-sm font-semibold text-green-700 leading-snug">
              {item.amount}
            </p>
            <p className="mt-2 text-xs text-gray-600 leading-relaxed">{item.description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white max-h-[280px] overflow-y-auto p-5 text-sm text-gray-700 space-y-4">
        <Section title="When commissions are earned">
          <BulletList items={cs.earnedRule} />
        </Section>
        <Section title="Payment schedule">
          <BulletList items={cs.paymentSchedule} />
        </Section>
        <Section title="Refunds &amp; chargebacks">
          <BulletList items={cs.refundsAndChargebacks} />
        </Section>
        <Section title="Post-termination commissions">
          <BulletList items={cs.postTerminationCommissions} />
        </Section>
      </div>

      <CheckboxRow
        label="I have read and understand the Commission Schedule above."
        checked={!!state.step_data.commission_acknowledged}
        onChange={(v) => updateField("commission_acknowledged", v)}
        icon={DollarSign}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 7 — Payment Info (Plaid Link → Dwolla funding source)
// ─────────────────────────────────────────────────────────────

const PLAID_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (
          publicToken: string,
          metadata: {
            institution?: { name?: string };
            accounts?: Array<{ id: string; name?: string }>;
          },
        ) => void;
        onExit?: (err: unknown) => void;
      }) => { open: () => void };
    };
  }
}

function loadPlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.Plaid) return resolve();
    const existing = document.getElementById("plaid-link-sdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Plaid script failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.id = "plaid-link-sdk";
    script.src = PLAID_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid script failed to load"));
    document.body.appendChild(script);
  });
}

function PaymentStep({
  state,
  token,
  updateField,
  onVerified,
}: {
  state: OnboardingState;
  token: string;
  updateField: <K extends keyof StepData>(key: K, value: StepData[K]) => void;
  onVerified: (updater: (prev: OnboardingState | null) => OnboardingState | null) => void;
}) {
  const [linking, setLinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payeeLegalName = state.step_data.payee_legal_name ?? state.step_data.full_legal_name ?? "";
  const businessName = state.step_data.contractor_business_name ?? state.step_data.business_name ?? "";

  async function handleLinkBank() {
    setError(null);
    if (!payeeLegalName.trim()) {
      setError("Enter your payee legal name before linking your bank.");
      return;
    }
    setLinking(true);
    try {
      await loadPlaidScript();
      const linkRes = await fetch(`/api/onboarding/contractor/${token}/dwolla/link-token`, {
        method: "POST",
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok) throw new Error(linkData.error ?? "Failed to create Plaid link token");
      if (!window.Plaid) throw new Error("Plaid SDK unavailable");

      const handler = window.Plaid.create({
        token: linkData.link_token,
        onSuccess: async (publicToken, metadata) => {
          setSaving(true);
          try {
            const accountId = metadata.accounts?.[0]?.id;
            if (!accountId) throw new Error("Plaid returned no account");
            const exchangeRes = await fetch(
              `/api/onboarding/contractor/${token}/dwolla/exchange`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  public_token: publicToken,
                  account_id: accountId,
                  institution_name: metadata.institution?.name,
                  payee_legal_name: payeeLegalName,
                  business_name: businessName,
                }),
              },
            );
            const data = await exchangeRes.json();
            if (!exchangeRes.ok) {
              setError(data.error ?? "Failed to complete bank verification");
            } else {
              onVerified((prev) => (prev ? { ...prev, payment_verified: true } : prev));
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Unexpected error");
          }
          setSaving(false);
          setLinking(false);
        },
        onExit: () => setLinking(false),
      });
      handler.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setLinking(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Set up secure ACH payouts. Bank verification is powered by{" "}
        <strong>Plaid</strong>; money movement runs through{" "}
        <strong>Dwolla</strong>. Vending Connector never sees or stores your
        routing / account numbers.
      </p>

      <Field label="Payee Legal Name" required>
        <input
          type="text"
          value={payeeLegalName}
          onChange={(e) => updateField("payee_legal_name", e.target.value)}
          className={inputClass}
          placeholder="Name on the receiving account"
        />
      </Field>

      <Field label="Business Name">
        <input
          type="text"
          value={businessName}
          onChange={(e) => updateField("contractor_business_name", e.target.value)}
          className={inputClass}
          placeholder="Optional — leave blank if payouts go to your personal name"
        />
      </Field>

      {state.payment_verified ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-green-600 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                Bank linked and verified
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Your commissions will be deposited on the normal Friday cycle
                after each transaction settles.
              </p>
              <button
                type="button"
                onClick={handleLinkBank}
                disabled={linking || saving}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                {linking || saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Working…
                  </>
                ) : (
                  "Change Bank Account"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleLinkBank}
          disabled={linking || saving || !payeeLegalName.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
        >
          {linking || saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {saving ? "Verifying…" : "Opening Plaid…"}
            </>
          ) : (
            <>
              <Landmark className="h-4 w-4" />
              Link Bank Account
            </>
          )}
        </button>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <p className="text-[11px] text-gray-400 leading-relaxed">
        By linking your bank, you authorize Apex AI Vending / Vending Connector
        to remit earned commissions via ACH to this account. You can update this
        information at any time.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Small shared UI helpers used by the legal steps
// ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{title}</h4>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-1.5 pl-4 list-disc marker:text-green-500">
      {items.map((i) => (
        <li key={i} className="leading-relaxed">{i}</li>
      ))}
    </ul>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
  icon: Icon,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
        checked
          ? "border-green-300 bg-green-50/60"
          : "border-gray-200 bg-white hover:border-green-200 hover:bg-green-50/30"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-gray-900">{label}</span>
        </div>
      </div>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────
// Completed view
// ─────────────────────────────────────────────────────────────

function CompletedView({ state }: { state: OnboardingState }) {
  const firstName = state.contractor_name?.split(" ")[0] ?? "there";
  const startDate = new Date(state.start_date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div className="min-h-screen flex items-center justify-center bg-light px-4">
      <div className="max-w-lg w-full rounded-2xl border border-green-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <FileSignature className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900">You&apos;re All Set!</h1>
        <p className="mt-3 text-sm text-gray-600">
          Thank you, <strong>{firstName}</strong>. Your onboarding documents have been successfully submitted.
        </p>
        <p className="mt-2 text-sm text-gray-800">
          <span className="font-semibold">Start Date:</span> {startDate}
        </p>
        <p className="mt-4 text-sm text-gray-600">
          The Apex AI Vending / Vending Connector leadership team has been notified. We look
          forward to working with you.
        </p>
      </div>
    </div>
  );
}
