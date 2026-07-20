-- Get Your Own Vending Website — intake wizard schema.
--
-- Customer-facing multi-step website builder. Each account can hold
-- one live draft + a history of submitted requests. Media (logo, staff
-- photos, machine photos, videos) live in their own table with signed-URL
-- delivery so private assets don't leak. Status transitions + admin
-- notes/requests land on website_request_activity for a durable
-- timeline visible either to the customer (public entries) or admin
-- only (internal entries).
--
-- Model choice: flat columns for the top-level scalars every
-- website needs (business_name, primary_contact, email, etc.) and JSONB
-- for structured lists (testimonials, faqs, revenue_drivers, social_links,
-- integrations, requested_features, launch_checklist, contact_form_fields,
-- inspiration_sites). Keeps queries fast on the scalars, keeps the schema
-- extensible without 20 child tables, and future-proofs the shape for
-- AI-driven website generation.
--
-- Additive migration — new tables, new bucket, new policies. No changes
-- to existing tables. Safe on live data.

-- ═════════════════════════════════════════════════════════════════════
-- website_requests
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS website_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Status matches the spec exactly.
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'submitted',
    'under_review',
    'needs_information',
    'approved_for_build',
    'in_development',
    'client_review',
    'ready_to_launch',
    'launched',
    'cancelled'
  )),

  -- Admin assignment
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- Step 1: Business
  business_name text,
  primary_contact text,
  phone text,
  email text,
  business_address text,
  years_in_business text,
  business_story text,
  mission_values text,

  -- Step 2: Brand
  logo_media_id uuid,                       -- FK filled after media upload; kept nullable for wizard flow
  brand_primary_color text,
  brand_secondary_color text,
  preferred_style text,                     -- 'modern' | 'corporate' | ... | 'other'
  preferred_style_other text,
  fonts text,
  tagline text,
  inspiration_sites jsonb DEFAULT '[]'::jsonb,   -- [{url, note}]

  -- Step 3: Products, Services & Target Customer
  primary_services jsonb DEFAULT '[]'::jsonb,    -- ['ai_vending', 'micro_markets', ...]
  primary_services_other text,
  revenue_drivers jsonb DEFAULT '[]'::jsonb,     -- [{name, description, pricing}]
  pricing_notes text,
  differentiators text,
  industries_served jsonb DEFAULT '[]'::jsonb,   -- ['offices', 'manufacturing', ...]
  industries_served_other text,
  geographic_market jsonb DEFAULT '{}'::jsonb,   -- {cities: [], states: [], counties: [], radius_miles: null}

  -- Step 4: Website Content
  homepage_message text,
  about_content text,
  services_content text,
  gallery_needed boolean,
  testimonials jsonb DEFAULT '[]'::jsonb,        -- [{name, quote, role, image_media_id}]
  faqs jsonb DEFAULT '[]'::jsonb,                -- [{question, answer}]
  primary_cta text,                              -- preset key or free text via primary_cta_custom
  primary_cta_custom text,
  secondary_cta text,

  -- Step 5: Media handled by website_request_media rows; social links here.
  social_links jsonb DEFAULT '{}'::jsonb,        -- {facebook, instagram, linkedin, tiktok, youtube, other}

  -- Step 6: Contact & Lead Capture
  inquiry_email text,
  public_phone text,
  business_hours text,
  contact_form_fields jsonb DEFAULT '[]'::jsonb, -- [{key, label, required, kind}]
  lead_delivery_destination text DEFAULT 'email' CHECK (lead_delivery_destination IN ('email', 'crm')),
  lead_delivery_email text,

  -- Step 7: Domain & Technology
  --   NO password / API secret / registrar credential fields — enforced by omission.
  --   Sensitive credentials, if ever needed, go through a separate secure workflow.
  domain_status text CHECK (domain_status IN ('yes', 'no', 'not_sure') OR domain_status IS NULL),
  current_domain text,
  domain_registrar text,
  business_email text,
  existing_website text,
  integrations jsonb DEFAULT '[]'::jsonb,        -- [{key, notes}]

  -- Step 8: Features Requested
  requested_features jsonb DEFAULT '[]'::jsonb,  -- [{key, notes}]
  requested_features_other text,

  -- Step 9: Launch Readiness
  launch_checklist jsonb DEFAULT '{}'::jsonb,    -- {own_domain: bool, logo_ready: bool, ...}
  legal_pages_needed jsonb DEFAULT '[]'::jsonb,  -- ['privacy_policy', 'terms_of_use', ...]
  legal_pages_other text,

  -- Step 10: Additional Notes
  additional_notes text,
  special_requests text,
  website_inspiration text,
  future_plans text,
  anything_else text,

  -- Submission acknowledgment
  content_ownership_acknowledged boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_requests_user
  ON website_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_requests_status
  ON website_requests(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_requests_assigned
  ON website_requests(assigned_to, status)
  WHERE assigned_to IS NOT NULL;

-- ═════════════════════════════════════════════════════════════════════
-- website_request_media
-- ═════════════════════════════════════════════════════════════════════
-- One row per uploaded asset. `kind` distinguishes the section it
-- belongs to (logo/staff/location/machine/product/video_link) so the
-- wizard can render each section's uploads separately.

CREATE TABLE IF NOT EXISTS website_request_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES website_requests(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'logo',
    'staff',
    'location',
    'machine',
    'product',
    'video',
    'video_link',
    'testimonial'
  )),
  file_path text,                    -- storage bucket path; null for video_link entries
  file_name text,
  file_size_bytes integer,
  mime_type text,
  external_url text,                 -- for kind='video_link'
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_request_media_request
  ON website_request_media(request_id, kind, sort_order);

-- Now the FK back-link from website_requests.logo_media_id
ALTER TABLE website_requests
  ADD CONSTRAINT website_requests_logo_media_fk
  FOREIGN KEY (logo_media_id) REFERENCES website_request_media(id) ON DELETE SET NULL;

-- ═════════════════════════════════════════════════════════════════════
-- website_request_activity
-- ═════════════════════════════════════════════════════════════════════
-- Status transitions, admin internal notes, request-info messages,
-- assignment changes. `visibility` gates whether the customer sees an
-- entry ('public') or only admin does ('internal').

CREATE TABLE IF NOT EXISTS website_request_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES website_requests(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,          -- 'status_changed', 'note_added', 'info_requested', 'assigned', 'submitted', 'edited'
  visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('public', 'internal')),
  previous_status text,
  new_status text,
  message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_request_activity_request
  ON website_request_activity(request_id, created_at DESC);

-- ═════════════════════════════════════════════════════════════════════
-- Storage bucket
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('website-request-media', 'website-request-media', false)
ON CONFLICT (id) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════
-- All writes flow through the API (service role). Callers get self-read
-- so client code can render its own draft without an extra server hop.

ALTER TABLE website_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_request_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_request_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON website_requests;
CREATE POLICY "Service role only" ON website_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Self read requests" ON website_requests;
CREATE POLICY "Self read requests" ON website_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role only" ON website_request_media;
CREATE POLICY "Service role only" ON website_request_media
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Self read media" ON website_request_media;
CREATE POLICY "Self read media" ON website_request_media
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM website_requests r
    WHERE r.id = website_request_media.request_id
      AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Service role only" ON website_request_activity;
CREATE POLICY "Service role only" ON website_request_activity
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Self read activity public" ON website_request_activity;
CREATE POLICY "Self read activity public" ON website_request_activity
  FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    AND EXISTS (
      SELECT 1 FROM website_requests r
      WHERE r.id = website_request_activity.request_id
        AND r.user_id = auth.uid()
    )
  );
