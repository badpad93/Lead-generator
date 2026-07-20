"use client";

import { TextField, TextArea, Checkbox } from "./fields";
import type { StepProps } from "./types";

const FEATURES = [
  { key: "photo_gallery", label: "Photo Gallery" },
  { key: "testimonials", label: "Customer Reviews / Testimonials" },
  { key: "google_maps", label: "Google Maps / Service Area" },
  { key: "online_payments", label: "Online Payments" },
  { key: "appointment_booking", label: "Appointment Booking" },
  { key: "blog", label: "Blog / News" },
  { key: "newsletter", label: "Newsletter Signup" },
  { key: "lead_forms", label: "Lead Generation Forms" },
  { key: "social_links", label: "Social Media Links" },
  { key: "google_analytics", label: "Google Analytics" },
  { key: "meta_pixel", label: "Meta Pixel" },
  { key: "seo_setup", label: "SEO Setup" },
  { key: "google_business", label: "Google Business Integration" },
  { key: "other", label: "Other" },
];

/**
 * Step 8 — Features Requested. Checklist of website features. Selecting
 * "Online Payments" reveals a conditional follow-up. "Other" reveals a
 * free-text field per spec.
 */
export default function WizardFeaturesStep({ request, updateField, isReadOnly }: StepProps) {
  const selected = request.requested_features || [];
  const selectedKeys = new Set(selected.map((f) => f.key));

  function toggle(key: string) {
    if (isReadOnly) return;
    if (selectedKeys.has(key)) {
      updateField("requested_features", selected.filter((f) => f.key !== key));
    } else {
      updateField("requested_features", [...selected, { key, notes: "" }]);
    }
  }

  function updateNote(key: string, value: string) {
    if (isReadOnly) return;
    updateField(
      "requested_features",
      selected.map((f) => (f.key === key ? { ...f, notes: value } : f)),
    );
  }

  const onlinePayments = selected.find((f) => f.key === "online_payments");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Features Requested</h2>
        <p className="text-sm text-gray-500 mt-1">
          Everything you&rsquo;d like to include. Toggle a feature and add notes if you have
          specifics.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {FEATURES.map((f) => {
          const on = selectedKeys.has(f.key);
          const row = selected.find((x) => x.key === f.key);
          return (
            <div key={f.key} className={`rounded-xl border p-3 ${on ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-white"}`}>
              <Checkbox
                label={f.label}
                checked={on}
                onChange={() => toggle(f.key)}
                disabled={isReadOnly}
              />
              {on && (
                <input
                  type="text"
                  value={row?.notes || ""}
                  onChange={(e) => updateNote(f.key, e.target.value)}
                  placeholder="Notes (optional)"
                  disabled={isReadOnly}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs bg-white disabled:bg-gray-50"
                />
              )}
            </div>
          );
        })}
      </div>

      {selectedKeys.has("other") && (
        <TextField
          label="Describe other feature"
          value={request.requested_features_other}
          onChange={(v) => updateField("requested_features_other", v)}
          disabled={isReadOnly}
          placeholder="What else should we build?"
        />
      )}

      {onlinePayments && (
        <TextArea
          label="What do customers need to pay for?"
          value={onlinePayments.notes || ""}
          onChange={(v) => updateNote("online_payments", v)}
          disabled={isReadOnly}
          rows={2}
          placeholder="e.g. Vending service deposits, coffee subscriptions, invoices."
        />
      )}
    </div>
  );
}
