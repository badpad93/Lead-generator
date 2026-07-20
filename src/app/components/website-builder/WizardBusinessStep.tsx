"use client";

import { TextField, TextArea } from "./fields";
import type { StepProps } from "./types";

/**
 * Step 1 — Business overview. Prefilled from the caller's profile on
 * draft creation (see POST /api/website-requests); the customer can
 * override anything here for the website context without changing
 * their platform account.
 */
export default function WizardBusinessStep({ request, updateField, isReadOnly }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Business Overview</h2>
        <p className="text-sm text-gray-500 mt-1">
          The basics — how customers reach you and what makes your business tick. We&rsquo;ve
          prefilled anything we already had on file; edit any of it for your website.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Business Name" value={request.business_name} onChange={(v) => updateField("business_name", v)} disabled={isReadOnly} required />
        <TextField label="Primary Contact" value={request.primary_contact} onChange={(v) => updateField("primary_contact", v)} disabled={isReadOnly} required />
        <TextField label="Phone" type="tel" value={request.phone} onChange={(v) => updateField("phone", v)} disabled={isReadOnly} required />
        <TextField label="Email" type="email" value={request.email} onChange={(v) => updateField("email", v)} disabled={isReadOnly} required />
      </div>

      <TextField
        label="Business Address"
        value={request.business_address}
        onChange={(v) => updateField("business_address", v)}
        disabled={isReadOnly}
        required
      />

      <TextField
        label="Years in Business"
        value={request.years_in_business}
        onChange={(v) => updateField("years_in_business", v)}
        disabled={isReadOnly}
        placeholder="e.g. 5 years"
      />

      <TextArea
        label="Business Story"
        value={request.business_story}
        onChange={(v) => updateField("business_story", v)}
        disabled={isReadOnly}
        placeholder="Tell us how your business started and what makes it unique."
        rows={4}
      />

      <TextArea
        label="Mission / Values"
        value={request.mission_values}
        onChange={(v) => updateField("mission_values", v)}
        disabled={isReadOnly}
        placeholder="What do you stand for? What matters to your team?"
        rows={3}
      />
    </div>
  );
}
