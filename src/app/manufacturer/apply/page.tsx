"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Cloud,
  CloudOff,
  CheckCircle2,
  Factory,
  Building2,
  AlertCircle,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { useDebouncedAutosave, type SaveState } from "@/hooks/useDebouncedAutosave";

/**
 * Manufacturer / Wholesaler enrollment wizard.
 *
 * Public entry from the /machines-for-sale marketplace CTA. If the
 * user isn't signed in, we bounce to /signup with a next-URL back
 * here. If signed in and no manufacturer_partners row exists, the
 * "Get Started" gate collects a legal company name and POSTs to
 * bootstrap the row. From there the wizard renders the current
 * step from state.current_step.
 *
 * Steps 2-6 ship in follow-up commits — placeholder stubs render
 * for now so the shell + progress + autosave can be smoke-tested
 * end to end from Step 1.
 */

const STEPS = [
  "Company Information",
  "Fulfillment",
  "Marketplace Agreement",
  "Equipment",
  "Payment Setup",
  "Submit for Review",
] as const;

interface Partner {
  id: string;
  legal_company_name: string;
  dba_or_brand: string | null;
  entity_type: "manufacturer" | "wholesaler" | "distributor";
  website: string | null;
  ein_tax_id: string | null;
  year_established: number | null;
  company_description: string | null;
  primary_contact_name: string | null;
  primary_contact_title: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  business_address: string | null;
  business_city: string | null;
  business_state: string | null;
  business_zip: string | null;
  business_country: string;
  current_step: number;
  status: string;
}

export default function ManufacturerApplyPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapName, setBootstrapName] = useState("");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setAuthed(false);
          router.push("/signup?next=/manufacturer/apply");
          return;
        }
        setAuthed(true);
        const res = await fetch("/api/manufacturer/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error || `Failed (HTTP ${res.status})`);
        } else if (data.partner) {
          setPartner(data.partner);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Network error");
      }
      setLoading(false);
    })();
  }, [router]);

  async function handleBootstrap() {
    setBootstrapError(null);
    if (!bootstrapName.trim()) {
      setBootstrapError("Legal company name is required.");
      return;
    }
    setBootstrapping(true);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/manufacturer/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ legal_company_name: bootstrapName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBootstrapError(data.error || `Failed (HTTP ${res.status})`);
      } else {
        setPartner(data.partner);
      }
    } catch (err) {
      setBootstrapError(err instanceof Error ? err.message : "Network error");
    }
    setBootstrapping(false);
  }

  if (authed === false) {
    // Redirect in progress
    return null;
  }
  if (loading) return <PageLoader />;

  if (loadError) {
    return <PageError message={loadError} />;
  }

  if (!partner) {
    return (
      <GetStarted
        bootstrapName={bootstrapName}
        setBootstrapName={setBootstrapName}
        onSubmit={handleBootstrap}
        submitting={bootstrapping}
        error={bootstrapError}
      />
    );
  }

  return <WizardShell initialPartner={partner} />;
}

// ─────────────────────────────────────────────────────────────
// Shell — progress bar, autosave indicator, step routing
// ─────────────────────────────────────────────────────────────

function WizardShell({ initialPartner }: { initialPartner: Partner }) {
  const [partner, setPartner] = useState<Partner>(initialPartner);

  const apiUrl = useMemo(() => "/api/manufacturer/me", []);

  const { queue, flush, saveState } = useDebouncedAutosave<Record<string, unknown>>({
    save: async (patch) => {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(apiUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Deliberately DO NOT setState from the response body — see
      // contractor onboarding: overwriting client state on save
      // response wipes any characters typed during the fetch.
      // Server does its own JSONB merge; response body is ignored.
    },
  });

  const currentStep = Math.min(Math.max(partner.current_step ?? 1, 1), STEPS.length);
  const stepIndex = currentStep - 1;

  function updateField<K extends keyof Partner>(key: K, value: Partner[K]) {
    setPartner((prev) => ({ ...prev, [key]: value }));
    queue({ [key]: value });
  }

  const goToStep = useCallback(
    async (next: number) => {
      await flush();
      const clamped = Math.min(Math.max(next, 1), STEPS.length);
      setPartner((prev) => ({ ...prev, current_step: clamped }));
      queue({ current_step: clamped });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [flush, queue],
  );

  return (
    <div className="min-h-screen bg-light">
      <Header saveState={saveState} legalName={partner.legal_company_name} status={partner.status} />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <ProgressBar currentStep={currentStep} />

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-green-600">
              Step {currentStep} of {STEPS.length}
            </p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">{STEPS[stepIndex]}</h2>
          </div>
          <div className="px-6 py-6">
            {currentStep === 1 && (
              <CompanyInfoStep partner={partner} updateField={updateField} />
            )}
            {currentStep >= 2 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                This step ships in a follow-up commit. Your progress on Step 1 is
                autosaved — use Back to review or edit any time.
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between rounded-b-2xl">
            <button
              type="button"
              onClick={() => goToStep(currentStep - 1)}
              disabled={currentStep === 1}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={() => goToStep(currentStep + 1)}
              disabled={currentStep >= STEPS.length}
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
// Step 1 — Company Information
// ─────────────────────────────────────────────────────────────

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

function CompanyInfoStep({
  partner,
  updateField,
}: {
  partner: Partner;
  updateField: <K extends keyof Partner>(key: K, value: Partner[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Basics about the entity that will sell equipment through Vending Connector.
        Required fields are marked <span className="text-red-500">*</span>.
      </p>

      <Field label="Legal Company Name" required>
        <input
          type="text"
          value={partner.legal_company_name ?? ""}
          onChange={(e) => updateField("legal_company_name", e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="DBA / Brand">
          <input
            type="text"
            value={partner.dba_or_brand ?? ""}
            onChange={(e) => updateField("dba_or_brand", e.target.value)}
            className={inputClass}
            placeholder="Optional trade name"
          />
        </Field>
        <Field label="Entity Type" required>
          <select
            value={partner.entity_type}
            onChange={(e) => updateField("entity_type", e.target.value as Partner["entity_type"])}
            className={inputClass}
          >
            <option value="manufacturer">Manufacturer</option>
            <option value="wholesaler">Wholesaler</option>
            <option value="distributor">Distributor</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Website">
          <input
            type="url"
            value={partner.website ?? ""}
            onChange={(e) => updateField("website", e.target.value)}
            className={inputClass}
            placeholder="https://"
          />
        </Field>
        <Field label="EIN / Tax ID">
          <input
            type="text"
            value={partner.ein_tax_id ?? ""}
            onChange={(e) => updateField("ein_tax_id", e.target.value)}
            className={inputClass}
            placeholder="e.g. 12-3456789"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Year Established">
          <input
            type="number"
            min="1800"
            max={new Date().getFullYear() + 1}
            value={partner.year_established ?? ""}
            onChange={(e) =>
              updateField(
                "year_established",
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Company Description">
        <textarea
          rows={4}
          value={partner.company_description ?? ""}
          onChange={(e) => updateField("company_description", e.target.value)}
          className={`${inputClass} resize-none`}
          placeholder="A few sentences about your equipment lineup and manufacturing footprint."
        />
      </Field>

      <hr className="my-6 border-gray-100" />
      <h3 className="text-sm font-semibold text-gray-700">Primary Contact</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Contact Name" required>
          <input
            type="text"
            value={partner.primary_contact_name ?? ""}
            onChange={(e) => updateField("primary_contact_name", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Title">
          <input
            type="text"
            value={partner.primary_contact_title ?? ""}
            onChange={(e) => updateField("primary_contact_title", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email" required>
          <input
            type="email"
            value={partner.primary_contact_email ?? ""}
            onChange={(e) => updateField("primary_contact_email", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Phone" required>
          <input
            type="tel"
            value={partner.primary_contact_phone ?? ""}
            onChange={(e) => updateField("primary_contact_phone", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <hr className="my-6 border-gray-100" />
      <h3 className="text-sm font-semibold text-gray-700">Business Address</h3>

      <Field label="Street" required>
        <input
          type="text"
          value={partner.business_address ?? ""}
          onChange={(e) => updateField("business_address", e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="sm:col-span-2">
          <Field label="City" required>
            <input
              type="text"
              value={partner.business_city ?? ""}
              onChange={(e) => updateField("business_city", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="State" required>
          <select
            value={partner.business_state ?? ""}
            onChange={(e) => updateField("business_state", e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="ZIP" required>
          <input
            type="text"
            inputMode="numeric"
            value={partner.business_zip ?? ""}
            onChange={(e) => updateField("business_zip", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Country">
        <input
          type="text"
          value={partner.business_country ?? "US"}
          onChange={(e) => updateField("business_country", e.target.value)}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function Header({
  saveState,
  legalName,
  status,
}: {
  saveState: SaveState;
  legalName: string;
  status: string;
}) {
  const statusLabel = ({
    draft: "Draft — not yet submitted",
    submitted: "Submitted for review",
    pending_review: "Pending Vending Connector review",
    changes_requested: "Changes requested by Vending Connector",
    approved: "Approved",
    active: "Active",
    suspended: "Suspended",
    rejected: "Rejected",
    terminated: "Terminated",
  } as Record<string, string>)[status] ?? status;

  return (
    <header className="bg-white border-b border-gray-100">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-green-600">
          Vending Connector · Manufacturer Onboarding
        </p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
              Sell Equipment on Vending Connector
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              <span className="font-semibold">{legalName}</span> · {statusLabel}
            </p>
          </div>
          <SaveIndicator state={saveState} />
        </div>
      </div>
    </header>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saved") return (
    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700">
      <CheckCircle2 className="h-3.5 w-3.5" /> Saved
    </span>
  );
  if (state === "saving") return (
    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
      <Cloud className="h-3.5 w-3.5" /> Saving…
    </span>
  );
  if (state === "error") return (
    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">
      <CloudOff className="h-3.5 w-3.5" /> Not saved
    </span>
  );
  return null;
}

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
// First-visit gate
// ─────────────────────────────────────────────────────────────

function GetStarted({
  bootstrapName,
  setBootstrapName,
  onSubmit,
  submitting,
  error,
}: {
  bootstrapName: string;
  setBootstrapName: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div className="min-h-screen bg-light flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <Factory className="h-7 w-7 text-green-600" />
        </div>
        <h1 className="text-center text-2xl font-extrabold text-gray-900">
          Apply to Sell Equipment on Vending Connector
        </h1>
        <p className="mt-3 text-center text-sm text-gray-600 leading-relaxed">
          Manufacturers and wholesalers can list vending equipment, sell directly to
          customers, and fulfill orders from their own inventory. Enter your legal
          company name to start the application.
        </p>

        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600">
              Legal Company Name <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={bootstrapName}
              onChange={(e) => setBootstrapName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Acme Vending, LLC"
              autoFocus
            />
          </label>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !bootstrapName.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <Building2 className="h-4 w-4" />
                Start Application
              </>
            )}
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-gray-400">
          You can save and return to your application at any time.
        </p>
      </div>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-light">
      <div className="text-center text-gray-500 text-sm">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-green-600" />
        Loading application…
      </div>
    </div>
  );
}

function PageError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-light px-4">
      <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
        <p className="text-sm text-gray-700">{message}</p>
        <Link
          href="/machines-for-sale"
          className="mt-4 inline-block text-sm text-green-600 hover:underline"
        >
          Back to marketplace
        </Link>
      </div>
    </div>
  );
}
