import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Shared allowlist + helpers for website intake requests.
 *
 * The wizard has 10 steps × dozens of fields; rather than list them in
 * every API route, this module owns the single source of truth for what
 * the customer can update on their draft. Admin edits use a superset
 * (see admin route).
 */

// Scalar text/enum/boolean columns the customer can set through the wizard.
export const CUSTOMER_EDITABLE_SCALARS = [
  // Business
  "business_name", "primary_contact", "phone", "email", "business_address",
  "years_in_business", "business_story", "mission_values",
  // Brand
  "brand_primary_color", "brand_secondary_color",
  "preferred_style", "preferred_style_other",
  "fonts", "tagline",
  // Products
  "primary_services_other",
  "pricing_notes", "differentiators",
  "industries_served_other",
  // Content
  "homepage_message", "about_content", "services_content",
  "gallery_needed",
  "primary_cta", "primary_cta_custom", "secondary_cta",
  // Contact
  "inquiry_email", "public_phone", "business_hours",
  "lead_delivery_destination", "lead_delivery_email",
  // Domain
  "domain_status", "current_domain", "domain_registrar",
  "business_email", "existing_website",
  // Features
  "requested_features_other",
  // Launch
  "legal_pages_other",
  // Notes
  "additional_notes", "special_requests", "website_inspiration",
  "future_plans", "anything_else",
  // Ack
  "content_ownership_acknowledged",
] as const;

// JSONB columns the customer can set — arrays/objects assembled client-side.
export const CUSTOMER_EDITABLE_JSONB = [
  "inspiration_sites",
  "primary_services",
  "revenue_drivers",
  "industries_served",
  "geographic_market",
  "testimonials",
  "faqs",
  "social_links",
  "contact_form_fields",
  "integrations",
  "requested_features",
  "launch_checklist",
  "legal_pages_needed",
] as const;

export type WebsiteRequestPatch = Partial<Record<
  (typeof CUSTOMER_EDITABLE_SCALARS)[number] | (typeof CUSTOMER_EDITABLE_JSONB)[number],
  unknown
>>;

const SCALAR_SET = new Set<string>(CUSTOMER_EDITABLE_SCALARS);
const JSONB_SET = new Set<string>(CUSTOMER_EDITABLE_JSONB);

/**
 * Pluck only the keys the customer is allowed to write. Anything else in
 * the body is silently dropped — no leakage of admin-only fields (status,
 * assigned_to, submitted_at, etc.) via a rogue PATCH.
 */
export function sanitizeCustomerPatch(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (SCALAR_SET.has(k) || JSONB_SET.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Validation for the FINAL submit — draft PATCH is loose (any subset is
 * fine while the customer is still filling it out).
 */
export interface SubmitValidation {
  ok: boolean;
  missing: string[];
}

export function validateSubmit(row: Record<string, unknown>): SubmitValidation {
  const required: Array<[string, string]> = [
    ["business_name", "Business name"],
    ["primary_contact", "Primary contact"],
    ["email", "Business email"],
    ["phone", "Phone"],
    ["business_address", "Business address"],
    ["homepage_message", "Homepage message"],
    ["primary_cta", "Primary call-to-action"],
    ["inquiry_email", "Public inquiry email"],
    ["public_phone", "Public phone"],
  ];
  const missing: string[] = [];
  for (const [key, label] of required) {
    const v = row[key];
    if (v == null || (typeof v === "string" && !v.trim())) missing.push(label);
  }
  if (row.content_ownership_acknowledged !== true) {
    missing.push("Content ownership acknowledgment");
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Signed URL for a private media asset. Short-lived so links can't be
 * shared long-term — admin re-generates when opening the detail page.
 */
export async function signedMediaUrl(filePath: string, expiresInSec = 600): Promise<string | null> {
  if (!filePath) return null;
  const { data, error } = await supabaseAdmin
    .storage
    .from("website-request-media")
    .createSignedUrl(filePath, expiresInSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
