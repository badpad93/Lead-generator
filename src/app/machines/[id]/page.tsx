"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Package,
  DollarSign,
  CreditCard,
  MapPin,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { Machine, PurchaseType } from "@/lib/machineTypes";
import {
  formatCents,
  LOCATION_SERVICES_MAX_CENTS,
  LOCATION_SERVICES_MIN_CENTS,
} from "@/lib/machineTypes";

interface FormState {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  company_name: string;
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
}

const initialForm: FormState = {
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  company_name: "",
  billing_address: "",
  billing_city: "",
  billing_state: "",
  billing_zip: "",
};

export default function MachineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [machine, setMachine] = useState<Machine | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [quantity, setQuantity] = useState<number>(1);
  const [purchaseType, setPurchaseType] = useState<PurchaseType>("cash");
  const [locationServices, setLocationServices] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [accepted, setAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/machines/${id}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d) => d && setMachine(d.machine))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const subtotalCents = useMemo(() => {
    if (!machine) return 0;
    return machine.price_cents * Math.max(1, quantity);
  }, [machine, quantity]);

  const monthlyEstimateCents = useMemo(() => {
    if (!machine || !machine.finance_estimate_monthly_cents) return 0;
    return machine.finance_estimate_monthly_cents * Math.max(1, quantity);
  }, [machine, quantity]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-160px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-primary" />
      </div>
    );
  }

  if (notFound || !machine) {
    return (
      <div className="flex min-h-[calc(100vh-160px)] flex-col items-center justify-center gap-4 px-4">
        <Package className="h-12 w-12 text-black-primary/30" />
        <p className="text-lg font-semibold text-black-primary">
          Machine not found
        </p>
        <Link
          href="/machines"
          className="rounded-xl bg-green-primary px-5 py-2 text-sm font-semibold text-white hover:bg-green-hover"
        >
          Back to machines
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!machine) return;

    if (!form.customer_name.trim() || !form.customer_email.trim()) {
      setError("Please provide your name and email.");
      return;
    }
    if (!accepted) {
      setError("You must accept the order terms to continue.");
      return;
    }
    if (quantity < 1) {
      setError("Quantity must be at least 1.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/machine-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machine_id: machine.slug,
          quantity,
          purchase_type: purchaseType,
          location_services_selected: locationServices,
          accepted_terms: true,
          ...form,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to submit order. Please try again.");
        setSubmitting(false);
        return;
      }
      setSuccess(data.id || "submitted");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-green-100 bg-white p-10 text-center shadow-lg">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-primary">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-black-primary">Order Submitted</h2>
          <p className="mt-3 text-sm text-black-primary/60">
            Apex AI Vending has received your order for{" "}
            <strong>{quantity} × {machine.name}</strong>. A team member will reach
            out within 1 business day to confirm details
            {purchaseType === "finance" ? ", send the financing application," : ","}
            {locationServices ? " share the location services engagement letter," : ""}
            {" "}and coordinate next steps.
          </p>
          <p className="mt-6 text-xs text-black-primary/40">
            Order reference: <code>{success}</code>
          </p>
          <Link
            href="/machines"
            className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-green-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-hover"
          >
            Back to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/machines"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-black-primary/50 transition-colors hover:text-green-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          All Machines
        </Link>

        <div className="grid gap-8 lg:grid-cols-5">
          {/* Machine details (left) */}
          <div className="lg:col-span-2">
            <div className="sticky top-4 space-y-4">
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="relative aspect-[4/3] w-full bg-gradient-to-br from-green-50 to-light-warm">
                  {machine.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={machine.image_url}
                      alt={machine.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-green-primary/40">
                      <Package className="h-20 w-20" />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h1 className="text-xl font-bold text-black-primary">
                    {machine.name}
                  </h1>
                  {machine.model && (
                    <p className="text-xs text-black-primary/50">
                      Model {machine.model}
                    </p>
                  )}
                  {machine.description && (
                    <p className="mt-3 text-sm leading-relaxed text-black-primary/70">
                      {machine.description}
                    </p>
                  )}
                  {machine.features && machine.features.length > 0 && (
                    <ul className="mt-4 space-y-1.5">
                      {machine.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2 text-sm text-black-primary/70"
                        >
                          <Zap className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-primary" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Configurator (right) */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Step 1 — Quantity */}
              <ConfiguratorSection title="1. How many machines?">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="h-10 w-10 rounded-xl border border-gray-200 text-lg font-bold text-black-primary hover:bg-gray-50"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    min={1}
                    max={100}
                    onChange={(e) =>
                      setQuantity(
                        Math.max(1, Math.min(100, Number(e.target.value) || 1))
                      )
                    }
                    className="h-10 w-24 rounded-xl border border-gray-200 text-center text-base font-semibold focus:border-green-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(100, q + 1))}
                    className="h-10 w-10 rounded-xl border border-gray-200 text-lg font-bold text-black-primary hover:bg-gray-50"
                  >
                    +
                  </button>
                  <span className="ml-auto text-sm text-black-primary/60">
                    Subtotal:{" "}
                    <strong className="text-black-primary">
                      {formatCents(subtotalCents)}
                    </strong>
                  </span>
                </div>
              </ConfiguratorSection>

              {/* Step 2 — Purchase type */}
              <ConfiguratorSection title="2. How do you want to pay?">
                <div className="grid gap-3 sm:grid-cols-2">
                  <RadioOption
                    icon={<DollarSign className="h-5 w-5" />}
                    label="Pay in Full"
                    description="Cash, wire, or ACH. No credit check required."
                    selected={purchaseType === "cash"}
                    onSelect={() => setPurchaseType("cash")}
                  />
                  <RadioOption
                    icon={<CreditCard className="h-5 w-5" />}
                    label="Finance"
                    description={
                      machine.finance_estimate_monthly_cents
                        ? `~${formatCents(
                            machine.finance_estimate_monthly_cents
                          )}/machine/month · ${
                            machine.finance_term_years ?? 10
                          } yrs`
                        : "Subject to credit approval"
                    }
                    selected={purchaseType === "finance"}
                    onSelect={() => setPurchaseType("finance")}
                  />
                </div>
                {purchaseType === "finance" && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    Estimated monthly payment for {quantity} machine
                    {quantity > 1 ? "s" : ""}:{" "}
                    <strong>{formatCents(monthlyEstimateCents)}/mo</strong>{" "}
                    over {machine.finance_term_years ?? 10} years (
                    {machine.finance_rate_label ?? "8–14% APR"}). Estimate only
                    — final terms subject to credit review.
                  </div>
                )}
              </ConfiguratorSection>

              {/* Step 3 — Location services */}
              <ConfiguratorSection title="3. Need help finding a location?">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 transition-colors hover:border-green-primary/40 hover:bg-green-50/30">
                  <input
                    type="checkbox"
                    checked={locationServices}
                    onChange={(e) => setLocationServices(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-primary focus:ring-green-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-green-primary" />
                      <span className="text-sm font-semibold text-black-primary">
                        Add Location Services
                      </span>
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-primary">
                        {formatCents(LOCATION_SERVICES_MIN_CENTS)}–
                        {formatCents(LOCATION_SERVICES_MAX_CENTS)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-black-primary/60">
                      Apex will find high-quality placement locations for your
                      machines. Quoted separately per location and only billed
                      after you approve a specific placement.
                    </p>
                  </div>
                </label>
              </ConfiguratorSection>

              {/* Step 4 — Customer info */}
              <ConfiguratorSection title="4. Your information">
                <div className="space-y-3">
                  <Field
                    label="Full Name *"
                    value={form.customer_name}
                    onChange={(v) => setForm((f) => ({ ...f, customer_name: v }))}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Email *"
                      type="email"
                      value={form.customer_email}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, customer_email: v }))
                      }
                    />
                    <Field
                      label="Phone"
                      type="tel"
                      value={form.customer_phone}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, customer_phone: v }))
                      }
                    />
                  </div>
                  <Field
                    label="Company Name"
                    value={form.company_name}
                    onChange={(v) => setForm((f) => ({ ...f, company_name: v }))}
                  />
                  <Field
                    label="Billing Address"
                    value={form.billing_address}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, billing_address: v }))
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field
                      label="City"
                      value={form.billing_city}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, billing_city: v }))
                      }
                    />
                    <Field
                      label="State"
                      value={form.billing_state}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, billing_state: v }))
                      }
                    />
                    <Field
                      label="ZIP"
                      value={form.billing_zip}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, billing_zip: v }))
                      }
                    />
                  </div>
                </div>
              </ConfiguratorSection>

              {/* Summary + accept */}
              <div className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-black-primary">
                  <ShieldCheck className="h-5 w-5 text-green-primary" />
                  Order Summary
                </h3>
                <dl className="space-y-2 text-sm">
                  <Row label={`${machine.name} × ${quantity}`} value={formatCents(subtotalCents)} />
                  <Row
                    label="Payment"
                    value={
                      purchaseType === "finance"
                        ? `Finance · ~${formatCents(monthlyEstimateCents)}/mo`
                        : "Pay in full"
                    }
                  />
                  {locationServices && (
                    <Row
                      label="Location Services"
                      value={`${formatCents(LOCATION_SERVICES_MIN_CENTS)}–${formatCents(LOCATION_SERVICES_MAX_CENTS)} (billed separately)`}
                    />
                  )}
                </dl>

                <label className="mt-5 flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-primary focus:ring-green-primary"
                  />
                  <span className="text-xs leading-relaxed text-black-primary/70">
                    I acknowledge this is a non-binding order form. Final
                    binding contracts for the machine purchase
                    {purchaseType === "finance" ? ", financing," : ""}
                    {locationServices ? " and location services" : ""} will be
                    sent to me for signature before any payment is collected.
                    Apex AI Vending is the vendor of record. I have read and
                    agree to the terms that will be emailed to me after
                    submission.
                  </span>
                </label>

                {error && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !accepted}
                  className="mt-5 w-full rounded-xl bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50"
                >
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    "Submit Order"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Presentational helpers                                             */
/* ------------------------------------------------------------------ */

function ConfiguratorSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-black-primary">{title}</h2>
      {children}
    </div>
  );
}

function RadioOption({
  icon,
  label,
  description,
  selected,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
        selected
          ? "border-green-primary bg-green-50/50 shadow-sm"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
          selected ? "bg-green-primary text-white" : "bg-gray-100 text-black-primary/60"
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-black-primary">{label}</p>
        <p className="mt-0.5 text-xs text-black-primary/60">{description}</p>
      </div>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-black-primary/70">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-black-primary outline-none transition-colors focus:border-green-primary focus:ring-2 focus:ring-green-100"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-black-primary/60">{label}</dt>
      <dd className="text-right font-medium text-black-primary">{value}</dd>
    </div>
  );
}
