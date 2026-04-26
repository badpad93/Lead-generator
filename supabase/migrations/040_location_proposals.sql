-- Migration 040: Location Placement Proposals
-- Adds: locations table, proposal-related columns on pipeline_steps/items/payments

-- ============================================================
-- 1. LOCATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_revealed BOOLEAN NOT NULL DEFAULT false,
  revealed_at TIMESTAMPTZ,
  -- Preliminary fields (safe to show before payment)
  industry TEXT,
  zip TEXT,
  employee_count INT,
  traffic_count INT,
  -- Sensitive fields (only shown after payment / to admins)
  location_name TEXT,
  address TEXT,
  phone TEXT,
  decision_maker_name TEXT,
  decision_maker_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_revealed ON public.locations(is_revealed);
CREATE INDEX IF NOT EXISTS idx_locations_zip ON public.locations(zip);

-- ============================================================
-- 2. EXTEND PIPELINE_STEPS WITH PROPOSAL TEMPLATE CONFIG
-- ============================================================
ALTER TABLE public.pipeline_steps
  ADD COLUMN IF NOT EXISTS pandadoc_preliminary_template_id TEXT,
  ADD COLUMN IF NOT EXISTS pandadoc_full_template_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'none';

-- ============================================================
-- 3. EXTEND PIPELINE_ITEMS WITH LOCATION + PROPOSAL TRACKING
-- ============================================================
ALTER TABLE public.pipeline_items
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id),
  ADD COLUMN IF NOT EXISTS proposal_status TEXT NOT NULL DEFAULT 'not_sent';

CREATE INDEX IF NOT EXISTS idx_pipeline_items_location ON public.pipeline_items(location_id);

-- ============================================================
-- 4. EXTEND PIPELINE_PAYMENTS WITH STRIPE FIELDS
-- ============================================================
ALTER TABLE public.pipeline_payments
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
