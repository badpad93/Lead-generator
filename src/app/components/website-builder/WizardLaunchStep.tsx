"use client";

import { Info } from "lucide-react";
import { TextField, TextArea, Checkbox, ChipToggle } from "./fields";
import type { StepProps } from "./types";

const CHECKLIST = [
  { key: "own_domain", label: "Own Domain" },
  { key: "logo_ready", label: "Logo Ready" },
  { key: "brand_colors", label: "Brand Colors Selected" },
  { key: "photos_ready", label: "Photos Ready" },
  { key: "copy_ready", label: "Website Copy / Content Ready" },
  { key: "contact_confirmed", label: "Contact Information Confirmed" },
  { key: "services_confirmed", label: "Services Confirmed" },
  { key: "service_area_confirmed", label: "Service Area Confirmed" },
  { key: "testimonials_available", label: "Testimonials Available" },
  { key: "legal_pages_needed", label: "Legal Pages Needed" },
];

const LEGAL_PAGES = [
  { value: "privacy_policy", label: "Privacy Policy" },
  { value: "terms_of_use", label: "Terms of Use" },
  { value: "cookie_notice", label: "Cookie Notice" },
  { value: "accessibility_statement", label: "Accessibility Statement" },
  { value: "other", label: "Other" },
];

/**
 * Step 9 — Launch Readiness. Checklist + legal-pages picker with
 * conditional disclosure of the free-text field when "Other" is picked.
 * Notes explicitly disclaim legal advice per spec section 11.
 */
export default function WizardLaunchStep({ request, updateField, isReadOnly }: StepProps) {
  const checklist = request.launch_checklist || {};
  const legalPages = request.legal_pages_needed || [];
  const legalPagesEnabled = checklist.legal_pages_needed === true;

  function toggleChecklist(key: string, value: boolean) {
    if (isReadOnly) return;
    updateField("launch_checklist", { ...checklist, [key]: value });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Launch Readiness</h2>
        <p className="text-sm text-gray-500 mt-1">
          Where are we today? Anything unchecked is fine — we&rsquo;ll help you close the gap.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CHECKLIST.map((c) => (
          <div key={c.key} className="rounded-xl border border-gray-100 bg-white p-3">
            <Checkbox
              label={c.label}
              checked={!!checklist[c.key]}
              onChange={(v) => toggleChecklist(c.key, v)}
              disabled={isReadOnly}
            />
          </div>
        ))}
      </div>

      {legalPagesEnabled && (
        <div>
          <ChipToggle
            label="Which legal pages?"
            options={LEGAL_PAGES}
            selected={legalPages}
            onChange={(next) => updateField("legal_pages_needed", next)}
            disabled={isReadOnly}
          />
          {legalPages.includes("other") && (
            <div className="mt-2">
              <TextField
                label="Describe other legal page"
                value={request.legal_pages_other}
                onChange={(v) => updateField("legal_pages_other", v)}
                disabled={isReadOnly}
              />
            </div>
          )}
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Legal-page templates we provide are starting points — not legal advice. We
              recommend having your attorney review the finished copy.
            </span>
          </div>
        </div>
      )}

      <TextArea label="Additional Ideas" value={request.additional_notes} onChange={(v) => updateField("additional_notes", v)} disabled={isReadOnly} rows={3} placeholder="Anything else you'd like to see?" />
      <TextArea label="Special Requests" value={request.special_requests} onChange={(v) => updateField("special_requests", v)} disabled={isReadOnly} rows={3} />
      <TextArea label="Website Inspiration (in addition to Brand step)" value={request.website_inspiration} onChange={(v) => updateField("website_inspiration", v)} disabled={isReadOnly} rows={3} />
      <TextArea label="Future Plans" value={request.future_plans} onChange={(v) => updateField("future_plans", v)} disabled={isReadOnly} rows={3} placeholder="What's on the roadmap for your business?" />
      <TextArea label="Anything Else We Should Know" value={request.anything_else} onChange={(v) => updateField("anything_else", v)} disabled={isReadOnly} rows={3} />
    </div>
  );
}
