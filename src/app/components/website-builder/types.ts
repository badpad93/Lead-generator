export interface WebsiteRequest {
  id: string;
  user_id: string;
  status: string;
  assigned_to: string | null;

  business_name: string | null;
  primary_contact: string | null;
  phone: string | null;
  email: string | null;
  business_address: string | null;
  years_in_business: string | null;
  business_story: string | null;
  mission_values: string | null;

  logo_media_id: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  preferred_style: string | null;
  preferred_style_other: string | null;
  fonts: string | null;
  tagline: string | null;
  inspiration_sites: Array<{ url: string; note?: string }> | null;

  primary_services: string[] | null;
  primary_services_other: string | null;
  revenue_drivers: Array<{ name: string; description?: string; pricing?: string }> | null;
  pricing_notes: string | null;
  differentiators: string | null;
  industries_served: string[] | null;
  industries_served_other: string | null;
  geographic_market: {
    cities?: string[];
    states?: string[];
    counties?: string[];
    radius_miles?: number | null;
  } | null;

  homepage_message: string | null;
  about_content: string | null;
  services_content: string | null;
  gallery_needed: boolean | null;
  testimonials: Array<{ name: string; quote: string; role?: string; image_media_id?: string | null }> | null;
  faqs: Array<{ question: string; answer: string }> | null;
  primary_cta: string | null;
  primary_cta_custom: string | null;
  secondary_cta: string | null;

  social_links: Record<string, string> | null;

  inquiry_email: string | null;
  public_phone: string | null;
  business_hours: string | null;
  contact_form_fields: Array<{ key: string; label: string; required: boolean; kind: string }> | null;
  lead_delivery_destination: "email" | "crm" | null;
  lead_delivery_email: string | null;

  domain_status: "yes" | "no" | "not_sure" | null;
  current_domain: string | null;
  domain_registrar: string | null;
  business_email: string | null;
  existing_website: string | null;
  integrations: Array<{ key: string; notes?: string }> | null;

  requested_features: Array<{ key: string; notes?: string }> | null;
  requested_features_other: string | null;

  launch_checklist: Record<string, boolean> | null;
  legal_pages_needed: string[] | null;
  legal_pages_other: string | null;

  additional_notes: string | null;
  special_requests: string | null;
  website_inspiration: string | null;
  future_plans: string | null;
  anything_else: string | null;

  content_ownership_acknowledged: boolean;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebsiteRequestMedia {
  id: string;
  request_id: string;
  kind: "logo" | "staff" | "location" | "machine" | "product" | "video" | "video_link" | "testimonial";
  file_path: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  external_url: string | null;
  caption: string | null;
  sort_order: number;
  signed_url: string | null;
  created_at: string;
}

export interface WebsiteRequestActivity {
  id: string;
  request_id: string;
  actor_id: string | null;
  event_type: string;
  visibility: "public" | "internal";
  previous_status: string | null;
  new_status: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface StepProps {
  request: WebsiteRequest;
  updateField: (key: string, value: unknown) => void;
  isReadOnly: boolean;
}
