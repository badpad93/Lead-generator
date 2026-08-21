"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import SignatureCanvas from "@/app/components/SignatureCanvas";
import { AGREEMENT_SECTIONS, PREAMBLE, GOVERNING_LAW } from "@/lib/manufacturerOnboarding/legal";

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

interface Warehouse {
  address: string;
  city: string;
  state: string;
  zip: string;
}

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

  // Step 2 — Fulfillment
  shipping_origin_address: string | null;
  shipping_origin_city: string | null;
  shipping_origin_state: string | null;
  shipping_origin_zip: string | null;
  additional_warehouses: Warehouse[];
  order_acknowledgment_time_hours: number | null;
  shipment_lead_time_days: number | null;
  freight_process: string | null;
  liftgate_available: boolean;
  inside_delivery_available: boolean;
  installation_available: boolean;
  return_policy: string | null;
  warranty_summary: string | null;
  warranty_doc_received: boolean;
  technical_contact_name: string | null;
  technical_contact_email: string | null;
  technical_contact_phone: string | null;
  escalation_contact_name: string | null;
  escalation_contact_email: string | null;
  escalation_contact_phone: string | null;
  inventory_update_method: "manual" | "csv" | "api" | "other";
  inventory_update_notes: string | null;

  // Step 3 — Agreement metadata
  current_agreement_version: string | null;

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
            {currentStep === 2 && (
              <FulfillmentStep partner={partner} updateField={updateField} setPartner={setPartner} />
            )}
            {currentStep === 3 && (
              <AgreementStep
                partner={partner}
                onAccepted={(version) =>
                  setPartner((prev) => ({ ...prev, current_agreement_version: version }))
                }
              />
            )}
            {currentStep === 4 && <EquipmentStep partner={partner} />}
            {currentStep >= 5 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                This step ships in a follow-up commit. Your progress on earlier steps is
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
// Step 2 — Fulfillment
// ─────────────────────────────────────────────────────────────

function FulfillmentStep({
  partner,
  updateField,
  setPartner,
}: {
  partner: Partner;
  updateField: <K extends keyof Partner>(key: K, value: Partner[K]) => void;
  setPartner: (updater: (prev: Partner) => Partner) => void;
}) {
  const warehouses = Array.isArray(partner.additional_warehouses)
    ? partner.additional_warehouses
    : [];

  function updateWarehouses(next: Warehouse[]) {
    updateField("additional_warehouses", next);
  }

  function addWarehouse() {
    updateWarehouses([...warehouses, { address: "", city: "", state: "", zip: "" }]);
  }

  function removeWarehouse(i: number) {
    updateWarehouses(warehouses.filter((_, idx) => idx !== i));
  }

  function updateWarehouse(i: number, key: keyof Warehouse, val: string) {
    updateWarehouses(
      warehouses.map((w, idx) => (idx === i ? { ...w, [key]: val } : w)),
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        How you ship, warranty, and support the equipment. This helps buyers set
        the right expectations at checkout.
      </p>

      {/* Shipping origin */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Primary shipping origin</h3>
        <Field label="Street" required>
          <input
            type="text"
            value={partner.shipping_origin_address ?? ""}
            onChange={(e) => updateField("shipping_origin_address", e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <Field label="City" required>
              <input
                type="text"
                value={partner.shipping_origin_city ?? ""}
                onChange={(e) => updateField("shipping_origin_city", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="State" required>
            <select
              value={partner.shipping_origin_state ?? ""}
              onChange={(e) => updateField("shipping_origin_state", e.target.value)}
              className={inputClass}
            >
              <option value="">Select…</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="ZIP" required>
            <input
              type="text"
              value={partner.shipping_origin_zip ?? ""}
              onChange={(e) => updateField("shipping_origin_zip", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      {/* Additional warehouses */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Additional warehouses</h3>
          <button
            type="button"
            onClick={addWarehouse}
            className="text-xs font-medium text-green-600 hover:underline"
          >
            + Add warehouse
          </button>
        </div>
        {warehouses.length === 0 && (
          <p className="text-xs text-gray-400">
            Optional — add if you ship from more than one location.
          </p>
        )}
        <div className="space-y-3">
          {warehouses.map((w, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 relative"
            >
              <button
                type="button"
                onClick={() => removeWarehouse(i)}
                className="absolute top-2 right-2 text-xs text-gray-400 hover:text-red-600"
                aria-label={`Remove warehouse ${i + 1}`}
              >
                Remove
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    value={w.address}
                    onChange={(e) => updateWarehouse(i, "address", e.target.value)}
                    placeholder="Street address"
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={w.city}
                    onChange={(e) => updateWarehouse(i, "city", e.target.value)}
                    placeholder="City"
                    className={inputClass}
                  />
                </div>
                <select
                  value={w.state}
                  onChange={(e) => updateWarehouse(i, "state", e.target.value)}
                  className={inputClass}
                >
                  <option value="">State</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  type="text"
                  value={w.zip}
                  onChange={(e) => updateWarehouse(i, "zip", e.target.value)}
                  placeholder="ZIP"
                  className={inputClass}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Timing */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Order acknowledgment time (hours)" required>
          <input
            type="number"
            min="0"
            value={partner.order_acknowledgment_time_hours ?? ""}
            onChange={(e) =>
              updateField(
                "order_acknowledgment_time_hours",
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className={inputClass}
            placeholder="e.g. 24"
          />
        </Field>
        <Field label="Shipment lead time (business days)" required>
          <input
            type="number"
            min="0"
            value={partner.shipment_lead_time_days ?? ""}
            onChange={(e) =>
              updateField(
                "shipment_lead_time_days",
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className={inputClass}
            placeholder="e.g. 7"
          />
        </Field>
      </section>

      {/* Freight process + delivery services */}
      <Field label="Freight / shipping process">
        <textarea
          rows={3}
          value={partner.freight_process ?? ""}
          onChange={(e) => updateField("freight_process", e.target.value)}
          className={`${inputClass} resize-none`}
          placeholder="How machines ship — LTL freight carrier(s), packaging, palletization, etc."
        />
      </Field>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Delivery services offered</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ToggleTile
            label="Liftgate available"
            checked={partner.liftgate_available}
            onChange={(v) => updateField("liftgate_available", v)}
          />
          <ToggleTile
            label="Inside delivery available"
            checked={partner.inside_delivery_available}
            onChange={(v) => updateField("inside_delivery_available", v)}
          />
          <ToggleTile
            label="Installation available"
            checked={partner.installation_available}
            onChange={(v) => updateField("installation_available", v)}
          />
        </div>
      </section>

      {/* Return + warranty */}
      <Field label="Return / cancellation policy" required>
        <textarea
          rows={3}
          value={partner.return_policy ?? ""}
          onChange={(e) => updateField("return_policy", e.target.value)}
          className={`${inputClass} resize-none`}
          placeholder="Timeframes, restocking fees, condition requirements."
        />
      </Field>

      <Field label="Warranty summary" required>
        <textarea
          rows={3}
          value={partner.warranty_summary ?? ""}
          onChange={(e) => updateField("warranty_summary", e.target.value)}
          className={`${inputClass} resize-none`}
          placeholder="Coverage period, what's included/excluded, claim process."
        />
      </Field>

      <WarrantyDocUpload partner={partner} setPartner={setPartner} />

      {/* Contacts */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Technical contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Name" required>
            <input
              type="text"
              value={partner.technical_contact_name ?? ""}
              onChange={(e) => updateField("technical_contact_name", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Email" required>
            <input
              type="email"
              value={partner.technical_contact_email ?? ""}
              onChange={(e) => updateField("technical_contact_email", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={partner.technical_contact_phone ?? ""}
              onChange={(e) => updateField("technical_contact_phone", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Escalation contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Name" required>
            <input
              type="text"
              value={partner.escalation_contact_name ?? ""}
              onChange={(e) => updateField("escalation_contact_name", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Email" required>
            <input
              type="email"
              value={partner.escalation_contact_email ?? ""}
              onChange={(e) => updateField("escalation_contact_email", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={partner.escalation_contact_phone ?? ""}
              onChange={(e) => updateField("escalation_contact_phone", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      {/* Inventory update method */}
      <Field label="Inventory update method" required>
        <select
          value={partner.inventory_update_method}
          onChange={(e) =>
            updateField("inventory_update_method", e.target.value as Partner["inventory_update_method"])
          }
          className={inputClass}
        >
          <option value="manual">Manual — update through the Vending Connector portal</option>
          <option value="csv">CSV — periodic bulk file upload</option>
          <option value="api">API — programmatic feed from your ERP/inventory system</option>
          <option value="other">Other — describe below</option>
        </select>
      </Field>

      {partner.inventory_update_method === "other" && (
        <Field label="Inventory update notes">
          <textarea
            rows={2}
            value={partner.inventory_update_notes ?? ""}
            onChange={(e) => updateField("inventory_update_notes", e.target.value)}
            className={`${inputClass} resize-none`}
            placeholder="How your inventory data will reach Vending Connector."
          />
        </Field>
      )}
    </div>
  );
}

function ToggleTile({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
        checked
          ? "border-green-300 bg-green-50/60"
          : "border-gray-200 bg-white hover:border-green-200 hover:bg-green-50/30"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
      />
      <span className="text-sm font-medium text-gray-900">{label}</span>
    </label>
  );
}

function WarrantyDocUpload({
  partner,
  setPartner,
}: {
  partner: Partner;
  setPartner: (updater: (prev: Partner) => Partner) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/manufacturer/me/warranty-doc", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Upload failed (HTTP ${res.status})`);
      } else {
        setPartner((prev) => ({ ...prev, warranty_doc_received: true }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setUploading(false);
  }

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-gray-600">
        Warranty documentation
      </span>
      {partner.warranty_doc_received ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <span className="text-sm text-gray-900 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Document uploaded — private to Vending Connector reviewers
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs font-medium text-green-700 hover:underline"
          >
            Replace
          </button>
        </div>
      ) : (
        <label
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-6 text-center cursor-pointer hover:border-green-300 hover:bg-green-50/30"
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-green-600" />
              <span className="text-sm text-gray-500">Uploading…</span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-gray-900">
                Click to upload warranty document
              </span>
              <span className="text-[11px] text-gray-500">PDF, JPEG, or PNG (max 15 MB)</span>
            </>
          )}
        </label>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
        className="hidden"
      />
      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 3 — Marketplace Partner Agreement
// ─────────────────────────────────────────────────────────────

interface AgreementForm {
  shipping_charges_method: string;
  returns_cancellation_terms: string;
  liability_cap_modification: string;
  exclusivity_terms: string;
  integration_notes: string;
  order_acknowledgment_target: string;
  shipment_target: string;
  manufacturer_escalation_contact: string;
  manufacturer_technical_contact: string;
  signer_printed_name: string;
  signer_title: string;
  reviewed: boolean;
}

function AgreementStep({
  partner,
  onAccepted,
}: {
  partner: Partner;
  onAccepted: (version: string) => void;
}) {
  const alreadyAccepted = !!partner.current_agreement_version;
  const [form, setForm] = useState<AgreementForm>({
    shipping_charges_method: "",
    returns_cancellation_terms: partner.return_policy ?? "",
    liability_cap_modification: "",
    exclusivity_terms: "",
    integration_notes: partner.inventory_update_notes ?? "",
    order_acknowledgment_target:
      partner.order_acknowledgment_time_hours != null
        ? `${partner.order_acknowledgment_time_hours} hours`
        : "",
    shipment_target:
      partner.shipment_lead_time_days != null
        ? `${partner.shipment_lead_time_days} business days`
        : "",
    manufacturer_escalation_contact:
      [partner.escalation_contact_name, partner.escalation_contact_email, partner.escalation_contact_phone]
        .filter(Boolean)
        .join(" · "),
    manufacturer_technical_contact:
      [partner.technical_contact_name, partner.technical_contact_email, partner.technical_contact_phone]
        .filter(Boolean)
        .join(" · "),
    signer_printed_name: partner.primary_contact_name ?? "",
    signer_title: partner.primary_contact_title ?? "",
    reviewed: false,
  });
  const [drawnSignature, setDrawnSignature] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);

  function updateForm<K extends keyof AgreementForm>(key: K, value: AgreementForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAccept() {
    setError(null);
    setMissing(null);
    if (!form.reviewed) {
      setError("Please confirm you have reviewed the agreement before signing.");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/manufacturer/me/agreement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          ...form,
          signature_type: drawnSignature ? "drawn" : "typed",
          signature_data: drawnSignature || null,
        }),
      });
      const rawBody = await res.text();
      let data: { error?: string; missing?: string[]; agreement_version?: string } = {};
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        data = { error: rawBody.slice(0, 300).trim() || `Failed (HTTP ${res.status})` };
      }
      if (!res.ok) {
        setError(data.error ?? `Failed (HTTP ${res.status})`);
        if (Array.isArray(data.missing)) setMissing(data.missing);
      } else if (data.agreement_version) {
        onAccepted(data.agreement_version);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setSubmitting(false);
  }

  if (alreadyAccepted) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Marketplace Partner Agreement accepted
            </p>
            <p className="mt-1 text-xs text-gray-600">
              Version <span className="font-mono">{partner.current_agreement_version}</span>.
              You can download the executed copy from your admin detail page after your
              application is approved.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Review the Marketplace Partner Agreement below. Then fill in the commercial
        variables that will appear on your executed copy, sign, and submit.
        Governing law: <span className="font-medium">{GOVERNING_LAW}</span>.
      </p>

      {/* Preamble + full agreement in a scrollable panel */}
      <div className="rounded-xl border border-gray-200 bg-white max-h-[420px] overflow-y-auto p-5 text-sm text-gray-700 space-y-4">
        <p className="whitespace-pre-line leading-relaxed">{PREAMBLE}</p>
        {AGREEMENT_SECTIONS.map((section) => (
          <div key={section.number}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              {section.number}. {section.title}
            </h4>
            <div className="space-y-2">
              {section.clauses.map((clause) => (
                <p key={clause} className="leading-relaxed">
                  {clause}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Exhibit A commercial terms */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Exhibit A — Commercial terms
        </h3>
        <div className="space-y-4">
          <Field label="Shipping charges / method" required>
            <textarea
              rows={2}
              value={form.shipping_charges_method}
              onChange={(e) => updateForm("shipping_charges_method", e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="How shipping is priced and billed on orders."
            />
          </Field>
          <Field label="Returns / cancellation terms" required>
            <textarea
              rows={2}
              value={form.returns_cancellation_terms}
              onChange={(e) => updateForm("returns_cancellation_terms", e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="Prefilled from Step 2 — edit if agreement-specific terms differ."
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Liability cap modification (optional)">
              <input
                type="text"
                value={form.liability_cap_modification}
                onChange={(e) => updateForm("liability_cap_modification", e.target.value)}
                className={inputClass}
                placeholder="Leave blank to use the default $25,000 cap"
              />
            </Field>
            <Field label="Exclusivity (optional)">
              <input
                type="text"
                value={form.exclusivity_terms}
                onChange={(e) => updateForm("exclusivity_terms", e.target.value)}
                className={inputClass}
                placeholder="e.g. Exclusive to VC in South Carolina"
              />
            </Field>
          </div>
        </div>
      </section>

      {/* Exhibit B integration + service levels */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Exhibit B — Integration and service levels
        </h3>
        <div className="space-y-4">
          <Field label="Integration method / notes" required>
            <textarea
              rows={2}
              value={form.integration_notes}
              onChange={(e) => updateForm("integration_notes", e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="Manual portal / CSV feed / API — how catalog + inventory sync works."
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Order acknowledgment target" required>
              <input
                type="text"
                value={form.order_acknowledgment_target}
                onChange={(e) => updateForm("order_acknowledgment_target", e.target.value)}
                className={inputClass}
                placeholder="e.g. 24 business hours"
              />
            </Field>
            <Field label="Shipment target" required>
              <input
                type="text"
                value={form.shipment_target}
                onChange={(e) => updateForm("shipment_target", e.target.value)}
                className={inputClass}
                placeholder="e.g. 5 business days"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Manufacturer escalation contact" required>
              <input
                type="text"
                value={form.manufacturer_escalation_contact}
                onChange={(e) => updateForm("manufacturer_escalation_contact", e.target.value)}
                className={inputClass}
                placeholder="Name · Email · Phone"
              />
            </Field>
            <Field label="Manufacturer technical contact" required>
              <input
                type="text"
                value={form.manufacturer_technical_contact}
                onChange={(e) => updateForm("manufacturer_technical_contact", e.target.value)}
                className={inputClass}
                placeholder="Name · Email · Phone"
              />
            </Field>
          </div>
        </div>
      </section>

      {/* Signature block */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Electronic signature</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          By typing your printed name and (optionally) drawing your signature below, you are
          electronically signing the Marketplace Partner Agreement above on behalf of
          <span className="font-medium"> {partner.legal_company_name}</span>. The date,
          time, IP address, and user agent are recorded in the agreement audit trail.
          Electronic signatures are permitted per Section 18.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Printed Name" required>
            <input
              type="text"
              value={form.signer_printed_name}
              onChange={(e) => updateForm("signer_printed_name", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Title" required>
            <input
              type="text"
              value={form.signer_title}
              onChange={(e) => updateForm("signer_title", e.target.value)}
              className={inputClass}
              placeholder="e.g. CEO"
            />
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-gray-600">
            Draw signature (optional)
          </span>
          <SignatureCanvas onSignature={setDrawnSignature} />
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={form.reviewed}
            onChange={(e) => updateForm("reviewed", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
          />
          <span className="text-sm text-gray-900">
            I have read and agree to the Marketplace Partner Agreement, its exhibits, and
            the commercial terms above on behalf of <span className="font-medium">{partner.legal_company_name}</span>.
          </span>
        </label>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p>{error}</p>
            {missing && missing.length > 0 && (
              <ul className="mt-1 ml-4 list-disc text-xs">
                {missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleAccept}
        disabled={submitting || !form.reviewed}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Accepting…
          </>
        ) : (
          "Accept and Sign Agreement"
        )}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 4 — Equipment (CRUD + margin cap + pricing exception)
// ─────────────────────────────────────────────────────────────

interface EquipmentRow {
  id: string;
  title: string | null;
  sku: string | null;
  machine_make: string | null;
  machine_model: string | null;
  machine_type: string | null;
  condition: string | null;
  quantity: number | null;
  wholesale_price_cents: number | null;
  buy_now_price: number | null;
  lead_time_days: number | null;
  status: string;
  description: string | null;
  temperature_zone: string | null;
  dimensions_text: string | null;
  weight_lbs: number | null;
  electrical_requirements: string | null;
  payment_system_compatibility: string | null;
  software_compatibility: string | null;
  certifications: string | null;
  spec_sheet_url: string | null;
  brochure_url: string | null;
  video_url: string | null;
  listing_warranty_summary: string | null;
  manufacturer_shipping_notes: string | null;
  msrp_cents: number | null;
  city: string | null;
  state: string | null;
  updated_at: string;
}

interface EquipmentForm {
  title: string;
  sku: string;
  machine_make: string;
  machine_model: string;
  machine_year: string;
  machine_type: string;
  condition: string;
  quantity: string;
  description: string;
  wholesale_price_dollars: string;
  final_price_dollars: string;
  msrp_dollars: string;
  lead_time_days: string;
  manufacturer_shipping_notes: string;
  listing_warranty_summary: string;
  spec_sheet_url: string;
  brochure_url: string;
  video_url: string;
  dimensions_text: string;
  weight_lbs: string;
  electrical_requirements: string;
  temperature_zone: string;
  payment_system_compatibility: string;
  software_compatibility: string;
  certifications: string;
  city: string;
  state: string;
}

const EMPTY_EQUIPMENT_FORM: EquipmentForm = {
  title: "", sku: "", machine_make: "", machine_model: "", machine_year: "",
  machine_type: "", condition: "new", quantity: "1", description: "",
  wholesale_price_dollars: "", final_price_dollars: "", msrp_dollars: "",
  lead_time_days: "", manufacturer_shipping_notes: "", listing_warranty_summary: "",
  spec_sheet_url: "", brochure_url: "", video_url: "",
  dimensions_text: "", weight_lbs: "", electrical_requirements: "",
  temperature_zone: "", payment_system_compatibility: "",
  software_compatibility: "", certifications: "",
  city: "", state: "",
};

function EquipmentStep({ partner }: { partner: Partner }) {
  const [equipment, setEquipment] = useState<EquipmentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EquipmentForm>({
    ...EMPTY_EQUIPMENT_FORM,
    city: partner.shipping_origin_city ?? "",
    state: partner.shipping_origin_state ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [marginOverCapListingId, setMarginOverCapListingId] = useState<string | null>(null);

  const authFetch = useCallback(
    async (input: string, init: RequestInit = {}) => {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = new Headers(init.headers);
      if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
      return fetch(input, { ...init, headers });
    },
    [],
  );

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await authFetch("/api/manufacturer/me/equipment");
      const data = await res.json();
      if (!res.ok) setLoadError(data.error ?? `Failed (HTTP ${res.status})`);
      else setEquipment(data.equipment ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
    }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => { void load(); }, [load]);

  function startNew() {
    setEditingId(null);
    setForm({
      ...EMPTY_EQUIPMENT_FORM,
      city: partner.shipping_origin_city ?? "",
      state: partner.shipping_origin_state ?? "",
    });
    setSaveError(null);
    setMarginOverCapListingId(null);
    setShowForm(true);
  }

  function startEdit(row: EquipmentRow) {
    setEditingId(row.id);
    setForm({
      title: row.title ?? "",
      sku: row.sku ?? "",
      machine_make: row.machine_make ?? "",
      machine_model: row.machine_model ?? "",
      machine_year: "",
      machine_type: row.machine_type ?? "",
      condition: row.condition ?? "new",
      quantity: String(row.quantity ?? 1),
      description: row.description ?? "",
      wholesale_price_dollars: row.wholesale_price_cents != null ? (row.wholesale_price_cents / 100).toFixed(2) : "",
      final_price_dollars: row.buy_now_price != null ? Number(row.buy_now_price).toFixed(2) : "",
      msrp_dollars: row.msrp_cents != null ? (row.msrp_cents / 100).toFixed(2) : "",
      lead_time_days: row.lead_time_days != null ? String(row.lead_time_days) : "",
      manufacturer_shipping_notes: row.manufacturer_shipping_notes ?? "",
      listing_warranty_summary: row.listing_warranty_summary ?? "",
      spec_sheet_url: row.spec_sheet_url ?? "",
      brochure_url: row.brochure_url ?? "",
      video_url: row.video_url ?? "",
      dimensions_text: row.dimensions_text ?? "",
      weight_lbs: row.weight_lbs != null ? String(row.weight_lbs) : "",
      electrical_requirements: row.electrical_requirements ?? "",
      temperature_zone: row.temperature_zone ?? "",
      payment_system_compatibility: row.payment_system_compatibility ?? "",
      software_compatibility: row.software_compatibility ?? "",
      certifications: row.certifications ?? "",
      city: row.city ?? partner.shipping_origin_city ?? "",
      state: row.state ?? partner.shipping_origin_state ?? "",
    });
    setSaveError(null);
    setMarginOverCapListingId(null);
    setShowForm(true);
  }

  async function handleSave() {
    setSaveError(null);
    setMarginOverCapListingId(null);
    if (!form.title.trim()) {
      setSaveError("Equipment name is required.");
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `/api/manufacturer/me/equipment/${editingId}`
        : "/api/manufacturer/me/equipment";
      const res = await authFetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const raw = await res.text();
      let data: { error?: string; code?: string; equipment?: EquipmentRow } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw.slice(0, 300) };
      }
      if (!res.ok) {
        setSaveError(data.error ?? `Failed (HTTP ${res.status})`);
        if (data.code === "margin_over_cap_needs_exception" && editingId) {
          setMarginOverCapListingId(editingId);
        }
      } else {
        setShowForm(false);
        setEditingId(null);
        void load();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this equipment listing?")) return;
    try {
      const res = await authFetch(`/api/manufacturer/me/equipment/${id}`, { method: "DELETE" });
      if (res.ok) void load();
    } catch { /* ignore */ }
  }

  async function handleSubmitForReview(id: string) {
    try {
      const res = await authFetch(`/api/manufacturer/me/equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending_review" }),
      });
      if (res.ok) void load();
    } catch { /* ignore */ }
  }

  async function handleRequestException() {
    if (!marginOverCapListingId) return;
    const requested = Number(form.final_price_dollars);
    if (!Number.isFinite(requested) || requested <= 0) return;
    const reason = window.prompt(
      "Briefly explain why this equipment needs margin above $300 (visible to VC reviewers):",
      "",
    );
    if (reason === null) return;
    try {
      const res = await authFetch(
        `/api/manufacturer/me/equipment/${marginOverCapListingId}/pricing-exception`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requested_final_price_dollars: requested,
            request_reason: reason,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error ?? "Failed to submit exception request.");
      } else {
        setSaveError(null);
        window.alert("Pricing exception submitted. VC will review and get back to you.");
      }
    } catch { /* ignore */ }
  }

  const marginPreviewCents = (() => {
    const w = Number(form.wholesale_price_dollars);
    const f = Number(form.final_price_dollars);
    if (!Number.isFinite(w) || !Number.isFinite(f)) return null;
    return Math.round((f - w) * 100);
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Your equipment listings</h3>
          <p className="mt-1 text-xs text-gray-500">
            Add each machine you want to sell through Vending Connector. Final VC price
            must be at least the manufacturer sale price; margin above{" "}
            <span className="font-medium">$300</span> requires an admin-approved pricing
            exception.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            + Add Equipment
          </button>
        )}
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {!showForm && (
        <>
          {loading && (
            <div className="text-sm text-gray-400 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading equipment…
            </div>
          )}
          {equipment && equipment.length === 0 && !loading && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
              No equipment yet. Click <strong>Add Equipment</strong> to create your first
              listing.
            </div>
          )}
          {equipment && equipment.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Equipment</th>
                    <th className="text-left px-3 py-2 font-medium">SKU</th>
                    <th className="text-right px-3 py-2 font-medium">Wholesale</th>
                    <th className="text-right px-3 py-2 font-medium">Final</th>
                    <th className="text-right px-3 py-2 font-medium">Margin</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-right px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {equipment.map((row) => {
                    const wholesaleD = row.wholesale_price_cents != null ? row.wholesale_price_cents / 100 : null;
                    const finalD = row.buy_now_price != null ? Number(row.buy_now_price) : null;
                    const marginD = wholesaleD != null && finalD != null ? finalD - wholesaleD : null;
                    return (
                      <tr key={row.id} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{row.title || "(untitled)"}</div>
                          <div className="text-xs text-gray-500">
                            {[row.machine_make, row.machine_model].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{row.sku || "—"}</td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {wholesaleD != null ? `$${wholesaleD.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {finalD != null ? `$${finalD.toFixed(2)}` : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right font-medium ${marginD != null && marginD > 300 ? "text-amber-700" : "text-green-700"}`}>
                          {marginD != null ? `$${marginD.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <EquipmentStatusPill status={row.status} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                            >
                              Edit
                            </button>
                            {row.status === "draft" && (
                              <button
                                type="button"
                                onClick={() => handleSubmitForReview(row.id)}
                                className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                              >
                                Submit for review
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelete(row.id)}
                              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showForm && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingId ? "Edit equipment" : "Add equipment"}
            </h3>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>

          {/* Core */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Equipment name" required>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="SKU">
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Make">
              <input
                type="text"
                value={form.machine_make}
                onChange={(e) => setForm({ ...form, machine_make: e.target.value })}
                className={inputClass}
                placeholder="Manufacturer brand name"
              />
            </Field>
            <Field label="Model">
              <input
                type="text"
                value={form.machine_model}
                onChange={(e) => setForm({ ...form, machine_model: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Category">
              <input
                type="text"
                value={form.machine_type}
                onChange={(e) => setForm({ ...form, machine_type: e.target.value })}
                className={inputClass}
                placeholder="Snack, beverage, combo, etc."
              />
            </Field>
            <Field label="Condition">
              <select
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
                className={inputClass}
              >
                <option value="new">New</option>
                <option value="refurbished">Refurbished</option>
                <option value="used">Used</option>
              </select>
            </Field>
            <Field label="Quantity in inventory">
              <input
                type="number"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Lead time (business days)">
              <input
                type="number"
                min="0"
                value={form.lead_time_days}
                onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={`${inputClass} resize-none`}
            />
          </Field>

          {/* Pricing — the money block */}
          <div className="rounded-xl border border-green-200 bg-green-50/40 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">Pricing</h4>
            <p className="text-[11px] text-gray-500">
              Manufacturer sale price is what VC pays you; final Vending Connector price is
              what the customer pays. Wholesale price is <strong>never</strong> shown to
              customers.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Manufacturer Sale Price (USD)" required>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.wholesale_price_dollars}
                  onChange={(e) => setForm({ ...form, wholesale_price_dollars: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Final Vending Connector Price (USD)" required>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.final_price_dollars}
                  onChange={(e) => setForm({ ...form, final_price_dollars: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="MSRP (optional)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.msrp_dollars}
                  onChange={(e) => setForm({ ...form, msrp_dollars: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            {marginPreviewCents != null && (
              <div
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ${
                  marginPreviewCents < 0
                    ? "bg-red-50 text-red-700"
                    : marginPreviewCents > 30000
                    ? "bg-amber-50 text-amber-800"
                    : "bg-green-50 text-green-700"
                }`}
              >
                VC margin preview: ${(marginPreviewCents / 100).toFixed(2)}
                {marginPreviewCents > 30000 && " — exceeds $300 cap, needs approved exception"}
              </div>
            )}
          </div>

          {/* Product specs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Dimensions">
              <input
                type="text"
                value={form.dimensions_text}
                onChange={(e) => setForm({ ...form, dimensions_text: e.target.value })}
                className={inputClass}
                placeholder="H x W x D"
              />
            </Field>
            <Field label="Weight (lbs)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.weight_lbs}
                onChange={(e) => setForm({ ...form, weight_lbs: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Electrical requirements">
              <input
                type="text"
                value={form.electrical_requirements}
                onChange={(e) => setForm({ ...form, electrical_requirements: e.target.value })}
                className={inputClass}
                placeholder="e.g. 120V / 15A dedicated circuit"
              />
            </Field>
            <Field label="Temperature zone">
              <select
                value={form.temperature_zone}
                onChange={(e) => setForm({ ...form, temperature_zone: e.target.value })}
                className={inputClass}
              >
                <option value="">Not applicable</option>
                <option value="ambient">Ambient</option>
                <option value="refrigerated">Refrigerated</option>
                <option value="frozen">Frozen</option>
                <option value="combo">Combo (multi-zone)</option>
              </select>
            </Field>
            <Field label="Payment system compatibility">
              <input
                type="text"
                value={form.payment_system_compatibility}
                onChange={(e) => setForm({ ...form, payment_system_compatibility: e.target.value })}
                className={inputClass}
                placeholder="e.g. Nayax, Cantaloupe, USA Tech"
              />
            </Field>
            <Field label="Software / VMS compatibility">
              <input
                type="text"
                value={form.software_compatibility}
                onChange={(e) => setForm({ ...form, software_compatibility: e.target.value })}
                className={inputClass}
                placeholder="Compatible VMS platforms"
              />
            </Field>
            <Field label="Certifications">
              <input
                type="text"
                value={form.certifications}
                onChange={(e) => setForm({ ...form, certifications: e.target.value })}
                className={inputClass}
                placeholder="UL, NSF, Energy Star, etc."
              />
            </Field>
            <Field label="Warranty summary (this listing)">
              <input
                type="text"
                value={form.listing_warranty_summary}
                onChange={(e) => setForm({ ...form, listing_warranty_summary: e.target.value })}
                className={inputClass}
                placeholder="Overrides your default warranty for this item"
              />
            </Field>
          </div>

          {/* Media links (upload UI ships in a follow-up) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Spec sheet URL">
              <input
                type="url"
                value={form.spec_sheet_url}
                onChange={(e) => setForm({ ...form, spec_sheet_url: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Brochure URL">
              <input
                type="url"
                value={form.brochure_url}
                onChange={(e) => setForm({ ...form, brochure_url: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Video URL">
              <input
                type="url"
                value={form.video_url}
                onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Shipping notes">
            <textarea
              rows={2}
              value={form.manufacturer_shipping_notes}
              onChange={(e) => setForm({ ...form, manufacturer_shipping_notes: e.target.value })}
              className={`${inputClass} resize-none`}
              placeholder="Ships from origin, freight class, special handling."
            />
          </Field>

          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 space-y-2">
              <p>{saveError}</p>
              {marginOverCapListingId && (
                <button
                  type="button"
                  onClick={handleRequestException}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                >
                  Request pricing exception
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Save changes" : "Add equipment"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EquipmentStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    pending: "bg-yellow-50 text-yellow-800",
    pending_review: "bg-yellow-50 text-yellow-800",
    approved: "bg-green-50 text-green-700",
    active: "bg-green-50 text-green-700",
    changes_requested: "bg-orange-50 text-orange-800",
    rejected: "bg-red-50 text-red-700",
    inactive: "bg-gray-100 text-gray-500",
    sold: "bg-blue-50 text-blue-700",
  };
  const label = {
    draft: "Draft",
    pending: "Pending Review",
    pending_review: "Pending Review",
    approved: "Approved",
    active: "Active",
    changes_requested: "Changes Requested",
    rejected: "Rejected",
    inactive: "Inactive",
    sold: "Sold",
  }[status] ?? status;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? map.draft}`}>
      {label}
    </span>
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
