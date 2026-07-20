"use client";

import { Trash2, Plus, ShieldAlert } from "lucide-react";
import { TextField, RadioGroup, ChipToggle } from "./fields";
import type { StepProps } from "./types";

const INTEGRATION_OPTIONS = [
  { value: "google_analytics", label: "Google Analytics" },
  { value: "meta_pixel", label: "Meta Pixel" },
  { value: "google_business", label: "Google Business Profile" },
  { value: "crm", label: "CRM" },
  { value: "scheduling", label: "Scheduling" },
  { value: "payments", label: "Payment processing" },
  { value: "newsletter", label: "Newsletter / email marketing" },
  { value: "other", label: "Other" },
];

/**
 * Step 7 — Domain & Technology.
 *
 * SECURITY RULE (spec section 9): NEVER ask for passwords, API secrets,
 * registrar credentials, etc. in free-text fields here. This step
 * captures which systems the customer uses — the operations team wires
 * credentials through a separate secure channel later.
 */
export default function WizardDomainStep({ request, updateField, isReadOnly }: StepProps) {
  const integrations = request.integrations || [];
  const selectedKeys = new Set(integrations.map((i) => i.key));
  const status = request.domain_status;

  function toggleIntegration(key: string) {
    if (isReadOnly) return;
    if (selectedKeys.has(key)) {
      updateField("integrations", integrations.filter((i) => i.key !== key));
    } else {
      updateField("integrations", [...integrations, { key, notes: "" }]);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Domain &amp; Technology</h2>
        <p className="text-sm text-gray-500 mt-1">
          What we&rsquo;ll build the site on. Zero passwords or API keys go in here — our team
          reaches out separately for any secure credential exchange.
        </p>
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 flex items-start gap-2 text-xs text-amber-900">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Never share passwords, API secrets, or credentials in this form. If we need any,
          we&rsquo;ll set up a secure exchange separately.
        </span>
      </div>

      <RadioGroup
        label="Do you currently own a domain?"
        options={[
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "not_sure", label: "Not sure" },
        ]}
        value={status}
        onChange={(v) => updateField("domain_status", v)}
        disabled={isReadOnly}
      />

      {status === "yes" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Current Domain"
            value={request.current_domain}
            onChange={(v) => updateField("current_domain", v)}
            disabled={isReadOnly}
            placeholder="e.g. yourbusiness.com"
          />
          <TextField
            label="Domain Registrar (optional)"
            value={request.domain_registrar}
            onChange={(v) => updateField("domain_registrar", v)}
            disabled={isReadOnly}
            placeholder="e.g. GoDaddy, Namecheap"
            hint="Name of the company where the domain is registered — no login details."
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField
          label="Business Email"
          type="email"
          value={request.business_email}
          onChange={(v) => updateField("business_email", v)}
          disabled={isReadOnly}
          placeholder="you@yourbusiness.com"
        />
        <TextField
          label="Existing Website URL"
          value={request.existing_website}
          onChange={(v) => updateField("existing_website", v)}
          disabled={isReadOnly}
          placeholder="https://…"
        />
      </div>

      <div>
        <ChipToggle
          label="Special Integrations"
          options={INTEGRATION_OPTIONS}
          selected={integrations.map((i) => i.key)}
          onChange={(next) => {
            const nextSet = new Set(next);
            const merged: Array<{ key: string; notes?: string }> = [];
            for (const key of next) {
              const existing = integrations.find((i) => i.key === key);
              merged.push(existing || { key, notes: "" });
            }
            updateField("integrations", merged.filter((i) => nextSet.has(i.key)));
          }}
          disabled={isReadOnly}
          hint="Pick anything you already use — we'll wire it up during build."
        />
        {integrations.length > 0 && (
          <div className="mt-3 space-y-2">
            {integrations.map((it) => (
              <div key={it.key} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white p-2">
                <span className="text-sm font-medium text-gray-800 w-40 shrink-0">
                  {INTEGRATION_OPTIONS.find((o) => o.value === it.key)?.label || it.key}
                </span>
                <input
                  type="text"
                  value={it.notes || ""}
                  onChange={(e) => updateField(
                    "integrations",
                    integrations.map((x) => (x.key === it.key ? { ...x, notes: e.target.value } : x)),
                  )}
                  placeholder="Notes (property ID, account name, etc. — no secrets)"
                  disabled={isReadOnly}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-50"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => toggleIntegration(it.key)}
                    className="p-1 text-gray-400 hover:text-red-600"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
