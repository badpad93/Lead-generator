"use client";

import { CheckCircle2, Pencil, Send, Loader2 } from "lucide-react";
import { Checkbox } from "./fields";
import type { WebsiteRequest, WebsiteRequestMedia, WebsiteRequestActivity } from "./types";

interface Props {
  request: WebsiteRequest;
  media: WebsiteRequestMedia[];
  activity: WebsiteRequestActivity[];
  updateField: (key: string, value: unknown) => void;
  isReadOnly: boolean;
  onEditStep: (key: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

/**
 * Step 10 — Review. Shows every section with an Edit shortcut back to
 * the relevant step, plus the required content-ownership acknowledgment
 * and the final Submit button.
 */
export default function WizardReviewStep({
  request, media, activity, updateField, isReadOnly, onEditStep, onSubmit, submitting,
}: Props) {
  const alreadySubmitted = request.status !== "draft" && request.status !== "needs_information";
  const mediaByKind = media.reduce<Record<string, WebsiteRequestMedia[]>>((acc, m) => {
    (acc[m.kind] ||= []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Review &amp; Submit</h2>
        <p className="text-sm text-gray-500 mt-1">
          Look everything over. Use the Edit buttons to jump back and tweak.
        </p>
      </div>

      <Section title="Business" onEdit={() => onEditStep("business")}>
        <Row label="Business" value={request.business_name} />
        <Row label="Contact" value={request.primary_contact} />
        <Row label="Email" value={request.email} />
        <Row label="Phone" value={request.phone} />
        <Row label="Address" value={request.business_address} />
        <Row label="Years in Business" value={request.years_in_business} />
        <Block label="Business Story" value={request.business_story} />
        <Block label="Mission / Values" value={request.mission_values} />
      </Section>

      <Section title="Brand" onEdit={() => onEditStep("brand")}>
        <Row label="Style" value={request.preferred_style || request.preferred_style_other} />
        <Row label="Primary Color" value={request.brand_primary_color} />
        <Row label="Secondary Color" value={request.brand_secondary_color} />
        <Row label="Fonts" value={request.fonts} />
        <Row label="Tagline" value={request.tagline} />
        <Row label="Inspiration Sites" value={(request.inspiration_sites || []).map((s) => s.url).filter(Boolean).join(", ") || null} />
      </Section>

      <Section title="Products &amp; Customer" onEdit={() => onEditStep("products")}>
        <Row label="Services" value={(request.primary_services || []).join(", ") || null} />
        <Row label="Industries" value={(request.industries_served || []).join(", ") || null} />
        <Row label="Cities" value={(request.geographic_market?.cities || []).join(", ") || null} />
        <Row label="States" value={(request.geographic_market?.states || []).join(", ") || null} />
        <Row label="Radius (mi)" value={request.geographic_market?.radius_miles?.toString() || null} />
        <Row label="Revenue Drivers" value={(request.revenue_drivers || []).map((d) => d.name).filter(Boolean).join(", ") || null} />
        <Block label="Differentiators" value={request.differentiators} />
      </Section>

      <Section title="Content" onEdit={() => onEditStep("content")}>
        <Block label="Hero Message" value={request.homepage_message} />
        <Block label="About" value={request.about_content} />
        <Row label="Gallery Needed" value={request.gallery_needed == null ? null : request.gallery_needed ? "Yes" : "No"} />
        <Row label="Testimonials" value={String((request.testimonials || []).length)} />
        <Row label="FAQs" value={String((request.faqs || []).length)} />
        <Row label="Primary CTA" value={request.primary_cta === "custom" ? request.primary_cta_custom : request.primary_cta} />
        <Row label="Secondary CTA" value={request.secondary_cta} />
      </Section>

      <Section title="Media" onEdit={() => onEditStep("media")}>
        <Row label="Logo" value={mediaByKind.logo?.length ? "Uploaded" : "—"} />
        <Row label="Staff Photos" value={String(mediaByKind.staff?.length || 0)} />
        <Row label="Location Photos" value={String(mediaByKind.location?.length || 0)} />
        <Row label="Machine Photos" value={String(mediaByKind.machine?.length || 0)} />
        <Row label="Product Photos" value={String(mediaByKind.product?.length || 0)} />
        <Row label="Videos" value={String(mediaByKind.video?.length || 0)} />
        <Row label="Video Links" value={String(mediaByKind.video_link?.length || 0)} />
      </Section>

      <Section title="Contact" onEdit={() => onEditStep("contact")}>
        <Row label="Public Email" value={request.inquiry_email} />
        <Row label="Public Phone" value={request.public_phone} />
        <Row label="Business Hours" value={request.business_hours} />
        <Row label="Form Fields" value={(request.contact_form_fields || []).map((f) => f.label).join(", ") || null} />
        <Row label="Lead Delivery" value={`Email → ${request.lead_delivery_email || "not set"}`} />
      </Section>

      <Section title="Domain &amp; Tech" onEdit={() => onEditStep("domain")}>
        <Row label="Owns Domain" value={request.domain_status} />
        <Row label="Domain" value={request.current_domain} />
        <Row label="Registrar" value={request.domain_registrar} />
        <Row label="Business Email" value={request.business_email} />
        <Row label="Existing Website" value={request.existing_website} />
        <Row label="Integrations" value={(request.integrations || []).map((i) => i.key).join(", ") || null} />
      </Section>

      <Section title="Features" onEdit={() => onEditStep("features")}>
        <Row label="Requested" value={(request.requested_features || []).map((f) => f.key).join(", ") || null} />
      </Section>

      <Section title="Launch Checklist" onEdit={() => onEditStep("launch")}>
        <ul className="text-sm text-gray-700 space-y-1">
          {Object.entries(request.launch_checklist || {}).map(([k, v]) => (
            <li key={k} className="flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 ${v ? "text-emerald-600" : "text-gray-300"}`} />
              <span>{k.replace(/_/g, " ")}</span>
            </li>
          ))}
        </ul>
        {(request.legal_pages_needed || []).length > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            Legal pages: {(request.legal_pages_needed || []).join(", ")}
          </p>
        )}
      </Section>

      {activity.length > 0 && (
        <Section title="Activity">
          <ul className="text-xs text-gray-600 space-y-1">
            {activity.map((a) => (
              <li key={a.id}>
                <span className="text-gray-400">{new Date(a.created_at).toLocaleString()}</span> — {a.message || a.event_type}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <Checkbox
          label="I confirm the information submitted is accurate and I have permission to use the uploaded logos, images, testimonials, and other content."
          checked={request.content_ownership_acknowledged}
          onChange={(v) => updateField("content_ownership_acknowledged", v)}
          disabled={isReadOnly}
        />
      </div>

      {!alreadySubmitted && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !request.content_ownership_acknowledged}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-3.5 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {request.status === "needs_information" ? "Resubmit Website Request" : "Submit Website Request"}
        </button>
      )}
    </div>
  );
}

function Section({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900" dangerouslySetInnerHTML={{ __html: title }} />
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-xs text-green-primary hover:text-green-hover"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="w-40 text-gray-500 shrink-0">{label}</span>
      <span className="flex-1 text-gray-900">{value || <span className="text-gray-300">—</span>}</span>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="text-sm">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-gray-900 whitespace-pre-wrap">{value || <span className="text-gray-300">—</span>}</p>
    </div>
  );
}
