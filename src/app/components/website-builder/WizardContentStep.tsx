"use client";

import { Trash2, Plus } from "lucide-react";
import { TextField, TextArea, RadioGroup } from "./fields";
import type { StepProps } from "./types";

const CTA_OPTIONS = [
  { value: "request_free_service", label: "Request Free Vending Service" },
  { value: "request_quote", label: "Request a Quote" },
  { value: "get_a_machine", label: "Get a Machine" },
  { value: "schedule_consultation", label: "Schedule a Consultation" },
  { value: "contact_us", label: "Contact Us" },
  { value: "custom", label: "Custom" },
] as const;

/**
 * Step 4 — Website Content. Hero, about, services copy, testimonials
 * (dynamic list), FAQs (dynamic list), CTAs.
 */
export default function WizardContentStep({ request, updateField, isReadOnly }: StepProps) {
  const testimonials = request.testimonials || [];
  const faqs = request.faqs || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Website Content</h2>
        <p className="text-sm text-gray-500 mt-1">
          The words on the page. We&rsquo;ll polish these; rough drafts are fine.
        </p>
      </div>

      <TextArea label="Homepage Message / Hero Message" value={request.homepage_message} onChange={(v) => updateField("homepage_message", v)} disabled={isReadOnly} required rows={3} placeholder="One-sentence pitch — what do you do, for whom?" />

      <TextArea label="About Us" value={request.about_content} onChange={(v) => updateField("about_content", v)} disabled={isReadOnly} rows={5} placeholder="A short story about the company. Team, history, mission." />

      <TextArea label="Services Content" value={request.services_content} onChange={(v) => updateField("services_content", v)} disabled={isReadOnly} rows={5} placeholder="Rough copy for your services page." />

      <RadioGroup
        label="Gallery Needed?"
        options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
        value={request.gallery_needed === true ? "yes" : request.gallery_needed === false ? "no" : null}
        onChange={(v) => updateField("gallery_needed", v === "yes")}
        disabled={isReadOnly}
      />

      {/* Testimonials */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Testimonials</label>
        <p className="text-[11px] text-gray-500 mb-2">Add real quotes from customers. We&rsquo;ll ask you to confirm permission at submit.</p>
        <div className="space-y-3">
          {testimonials.map((t, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={t.name}
                  onChange={(e) => {
                    const next = [...testimonials];
                    next[i] = { ...next[i], name: e.target.value };
                    updateField("testimonials", next);
                  }}
                  placeholder="Customer / company name"
                  disabled={isReadOnly}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-100"
                />
                <input
                  type="text"
                  value={t.role || ""}
                  onChange={(e) => {
                    const next = [...testimonials];
                    next[i] = { ...next[i], role: e.target.value };
                    updateField("testimonials", next);
                  }}
                  placeholder="Role/title (optional)"
                  disabled={isReadOnly}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-100"
                />
              </div>
              <div className="flex gap-2">
                <textarea
                  value={t.quote}
                  onChange={(e) => {
                    const next = [...testimonials];
                    next[i] = { ...next[i], quote: e.target.value };
                    updateField("testimonials", next);
                  }}
                  placeholder="The quote"
                  disabled={isReadOnly}
                  rows={2}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-100"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => updateField("testimonials", testimonials.filter((_, x) => x !== i))}
                    className="rounded-lg p-2 text-gray-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => updateField("testimonials", [...testimonials, { name: "", quote: "", role: "" }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add Testimonial
            </button>
          )}
        </div>
      </div>

      {/* FAQs */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">FAQs</label>
        <p className="text-[11px] text-gray-500 mb-2">Common questions your customers ask.</p>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={f.question}
                  onChange={(e) => {
                    const next = [...faqs];
                    next[i] = { ...next[i], question: e.target.value };
                    updateField("faqs", next);
                  }}
                  placeholder="Question"
                  disabled={isReadOnly}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-100"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => updateField("faqs", faqs.filter((_, x) => x !== i))}
                    className="rounded-lg p-2 text-gray-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <textarea
                value={f.answer}
                onChange={(e) => {
                  const next = [...faqs];
                  next[i] = { ...next[i], answer: e.target.value };
                  updateField("faqs", next);
                }}
                placeholder="Answer"
                disabled={isReadOnly}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white disabled:bg-gray-100"
              />
            </div>
          ))}
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => updateField("faqs", [...faqs, { question: "", answer: "" }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add FAQ
            </button>
          )}
        </div>
      </div>

      {/* CTAs */}
      <RadioGroup
        label="Primary Call-to-Action"
        options={CTA_OPTIONS as unknown as Array<{ value: string; label: string }>}
        value={request.primary_cta}
        onChange={(v) => updateField("primary_cta", v)}
        disabled={isReadOnly}
      />
      {request.primary_cta === "custom" && (
        <TextField
          label="Custom CTA text"
          value={request.primary_cta_custom}
          onChange={(v) => updateField("primary_cta_custom", v)}
          disabled={isReadOnly}
          required
        />
      )}
      <TextField label="Optional Secondary CTA" value={request.secondary_cta} onChange={(v) => updateField("secondary_cta", v)} disabled={isReadOnly} placeholder="e.g. Learn More" />
    </div>
  );
}
