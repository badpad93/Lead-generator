"use client";

import { Trash2, Plus, Info } from "lucide-react";
import { TextField, TextArea, Checkbox } from "./fields";
import type { StepProps } from "./types";

const AVAILABLE_FIELDS = [
  { key: "name", label: "Name", kind: "text" },
  { key: "company", label: "Company", kind: "text" },
  { key: "email", label: "Email", kind: "email" },
  { key: "phone", label: "Phone", kind: "tel" },
  { key: "address", label: "Address", kind: "text" },
  { key: "city", label: "City", kind: "text" },
  { key: "state", label: "State", kind: "text" },
  { key: "zip", label: "ZIP", kind: "text" },
  { key: "business_type", label: "Business Type", kind: "text" },
  { key: "employee_count", label: "Employee Count", kind: "number" },
  { key: "foot_traffic", label: "Estimated Daily Foot Traffic", kind: "number" },
  { key: "service_requested", label: "Service Requested", kind: "text" },
  { key: "message", label: "Message", kind: "textarea" },
] as const;

/**
 * Step 6 — Contact & Lead Capture. The customer configures the contact
 * form fields they want on their website + where new leads should be
 * delivered.
 *
 * SECURITY: Only email delivery is offered in v1. Routing to the CRM
 * would require the caller to have CRM permission, which we deliberately
 * do not check here — Lead Generator access ≠ CRM access. The
 * lead_delivery_destination column supports 'crm' for future work but
 * the UI locks it to email.
 */
export default function WizardContactStep({ request, updateField, isReadOnly }: StepProps) {
  const fields = request.contact_form_fields || [];
  const enabledKeys = new Set(fields.map((f) => f.key));

  function toggleField(key: string, label: string, kind: string) {
    if (isReadOnly) return;
    if (enabledKeys.has(key)) {
      updateField("contact_form_fields", fields.filter((f) => f.key !== key));
    } else {
      updateField("contact_form_fields", [...fields, { key, label, kind, required: false }]);
    }
  }

  function toggleRequired(key: string) {
    if (isReadOnly) return;
    updateField(
      "contact_form_fields",
      fields.map((f) => (f.key === key ? { ...f, required: !f.required } : f)),
    );
  }

  const customFields = fields.filter((f) => !AVAILABLE_FIELDS.some((a) => a.key === f.key));

  function addCustom() {
    if (isReadOnly) return;
    const label = prompt("Custom field label?");
    if (!label) return;
    const key = label.toLowerCase().replace(/[^\w]/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || `custom_${fields.length}`;
    updateField("contact_form_fields", [...fields, { key, label, kind: "text", required: false }]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Contact &amp; Lead Capture</h2>
        <p className="text-sm text-gray-500 mt-1">
          How customers reach you, and what your website contact form asks them.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Public Inquiry Email" type="email" value={request.inquiry_email} onChange={(v) => updateField("inquiry_email", v)} disabled={isReadOnly} required />
        <TextField label="Public Phone Number" type="tel" value={request.public_phone} onChange={(v) => updateField("public_phone", v)} disabled={isReadOnly} required />
      </div>

      <TextArea label="Business Hours" value={request.business_hours} onChange={(v) => updateField("business_hours", v)} disabled={isReadOnly} rows={2} placeholder="e.g. Mon–Fri 8a–6p, closed weekends" />

      {/* Contact form field builder */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Contact Form Fields</label>
        <p className="text-[11px] text-gray-500 mb-2">Pick what to ask on your website form. Toggle Required per field.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {AVAILABLE_FIELDS.map((f) => {
            const on = enabledKeys.has(f.key);
            const row = fields.find((x) => x.key === f.key);
            return (
              <div key={f.key} className={`rounded-lg border p-3 ${on ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-white"}`}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleField(f.key, f.label, f.kind)}
                    disabled={isReadOnly}
                    className="h-4 w-4 rounded border-gray-300 text-green-600"
                  />
                  <span className="text-sm text-gray-800">{f.label}</span>
                </label>
                {on && (
                  <label className="flex items-center gap-2 mt-2 pl-6 text-[11px] text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!row?.required}
                      onChange={() => toggleRequired(f.key)}
                      disabled={isReadOnly}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-green-600"
                    />
                    Required
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {customFields.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase">Custom Fields</p>
            {customFields.map((f) => (
              <div key={f.key} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 text-sm">
                <span className="flex-1">{f.label}</span>
                <label className="text-[11px] text-gray-500 flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={() => toggleRequired(f.key)}
                    disabled={isReadOnly}
                    className="h-3.5 w-3.5 rounded"
                  /> Required
                </label>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => updateField("contact_form_fields", fields.filter((x) => x.key !== f.key))}
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

        {!isReadOnly && (
          <button
            type="button"
            onClick={addCustom}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add Custom Field
          </button>
        )}
      </div>

      {/* Lead delivery */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Where should new website leads be delivered?</label>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <Checkbox
            label="Email"
            checked={request.lead_delivery_destination !== "crm"}
            onChange={() => updateField("lead_delivery_destination", "email")}
            disabled={isReadOnly}
          />
          <div className="mt-3 pl-6">
            <TextField
              label="Delivery email address"
              type="email"
              value={request.lead_delivery_email}
              onChange={(v) => updateField("lead_delivery_email", v)}
              disabled={isReadOnly || request.lead_delivery_destination === "crm"}
              placeholder="leads@yourdomain.com"
            />
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              CRM routing is a separate integration we roll out per-account. Contact your admin
              to enable it — the wizard defaults to email delivery so no CRM permissions are
              granted through this form.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
