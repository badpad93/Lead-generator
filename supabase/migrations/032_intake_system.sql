-- Migration 032: Sales Intake System
-- Adds intake_leads, location_requests, sop_guidance, and scoring fields to deals

-- 1. Intake leads table (public-facing form submissions)
CREATE TABLE IF NOT EXISTS public.intake_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  business_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  services_needed JSONB DEFAULT '[]'::jsonb,
  budget_range TEXT,
  timeline TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'unqualified', 'lost')),
  -- Business profile
  business_type TEXT,
  years_in_business TEXT,
  num_employees TEXT,
  annual_revenue TEXT,
  -- Current vending status
  has_vending_currently BOOLEAN DEFAULT false,
  current_provider TEXT,
  pain_points TEXT,
  -- Location details (conditional)
  num_locations_needed INT,
  target_states JSONB DEFAULT '[]'::jsonb,
  target_zips JSONB DEFAULT '[]'::jsonb,
  location_types_preferred JSONB DEFAULT '[]'::jsonb,
  foot_traffic_estimate TEXT,
  -- Decision authority
  is_decision_maker BOOLEAN DEFAULT true,
  decision_maker_name TEXT,
  decision_maker_title TEXT,
  decision_timeline TEXT,
  -- Notes
  notes TEXT,
  referral_source TEXT,
  -- Linking
  account_id UUID REFERENCES public.sales_accounts(id),
  deal_id UUID REFERENCES public.sales_deals(id),
  sales_lead_id UUID REFERENCES public.sales_leads(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_leads_email ON public.intake_leads(email);
CREATE INDEX IF NOT EXISTS idx_intake_leads_status ON public.intake_leads(status);

-- 2. Location requests table
CREATE TABLE IF NOT EXISTS public.location_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.sales_deals(id),
  account_id UUID REFERENCES public.sales_accounts(id),
  intake_lead_id UUID REFERENCES public.intake_leads(id),
  -- Client info
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  -- Placement details
  target_zips JSONB DEFAULT '[]'::jsonb,
  target_cities JSONB DEFAULT '[]'::jsonb,
  target_states JSONB DEFAULT '[]'::jsonb,
  machine_count INT DEFAULT 1,
  machine_types JSONB DEFAULT '[]'::jsonb,
  -- Location profile
  preferred_location_types JSONB DEFAULT '[]'::jsonb,
  min_foot_traffic INT,
  max_commission_rate NUMERIC(5,2),
  -- Preferences & restrictions
  preferences JSONB DEFAULT '{}'::jsonb,
  restrictions JSONB DEFAULT '{}'::jsonb,
  -- Budget & expectations
  budget NUMERIC(12,2),
  expected_monthly_revenue NUMERIC(12,2),
  placement_timeline TEXT,
  -- Agreement prep
  has_business_license BOOLEAN DEFAULT false,
  has_insurance BOOLEAN DEFAULT false,
  has_w9 BOOLEAN DEFAULT false,
  agreement_notes TEXT,
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'placed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_requests_deal ON public.location_requests(deal_id);
CREATE INDEX IF NOT EXISTS idx_location_requests_account ON public.location_requests(account_id);

-- 3. SOP guidance table
CREATE TABLE IF NOT EXISTS public.sop_guidance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_name TEXT NOT NULL,
  section TEXT NOT NULL,
  field_name TEXT,
  trigger_condition JSONB DEFAULT '{}'::jsonb,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('strategy', 'script', 'risk', 'upsell')),
  priority INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sop_guidance_form ON public.sop_guidance(form_name, section);

-- 4. Add scoring fields to sales_deals (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_deals' AND column_name = 'deal_quality_score') THEN
    ALTER TABLE public.sales_deals ADD COLUMN deal_quality_score INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_deals' AND column_name = 'intent_score') THEN
    ALTER TABLE public.sales_deals ADD COLUMN intent_score INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_deals' AND column_name = 'budget_score') THEN
    ALTER TABLE public.sales_deals ADD COLUMN budget_score INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_deals' AND column_name = 'readiness_score') THEN
    ALTER TABLE public.sales_deals ADD COLUMN readiness_score INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_deals' AND column_name = 'upsell_score') THEN
    ALTER TABLE public.sales_deals ADD COLUMN upsell_score INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_deals' AND column_name = 'ai_summary') THEN
    ALTER TABLE public.sales_deals ADD COLUMN ai_summary TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_deals' AND column_name = 'ai_next_step') THEN
    ALTER TABLE public.sales_deals ADD COLUMN ai_next_step TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_deals' AND column_name = 'ai_risk_flags') THEN
    ALTER TABLE public.sales_deals ADD COLUMN ai_risk_flags JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_deals' AND column_name = 'market_leader_id') THEN
    ALTER TABLE public.sales_deals ADD COLUMN market_leader_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- 5. Seed SOP guidance
INSERT INTO public.sop_guidance (form_name, section, field_name, trigger_condition, title, content, type, priority) VALUES
-- Lead Intake - Basic Info
('lead-intake', 'basic_info', 'full_name', '{}', 'Build Rapport First', 'Always use their name. Ask: "What made you reach out today?" — let them talk before pitching.', 'script', 10),
('lead-intake', 'basic_info', 'email', '{}', 'Verify Email Accuracy', 'Confirm spelling. Business emails signal higher intent than gmail/yahoo.', 'strategy', 5),

-- Lead Intake - Services
('lead-intake', 'services_needed', NULL, '{"services_count_gte": 3}', 'Multi-Service Bundle Opportunity', 'When 3+ services selected, offer the Total Operator Package at a 15% discount. This client is a strong upsell candidate.', 'upsell', 20),
('lead-intake', 'services_needed', NULL, '{"has_service": "financing"}', 'Financing Risk Check', 'Ask about credit score range and time in business. Financing requires 650+ credit and 2+ years in business.', 'risk', 15),
('lead-intake', 'services_needed', NULL, '{"has_service": "location"}', 'Location Services Deep Dive', 'Get specific: target zips, preferred location types, foot traffic needs. More detail = faster placement.', 'strategy', 15),

-- Lead Intake - Budget
('lead-intake', 'budget_timeline', 'budget_range', '{"budget_range": "under_5k"}', 'Low Budget - Manage Expectations', 'Under $5k limits options. Focus on 1 machine + location. Mention financing to expand what is possible.', 'risk', 15),
('lead-intake', 'budget_timeline', 'budget_range', '{"budget_range": "50k_plus"}', 'High Budget - VIP Treatment', 'This is a whale. Offer dedicated account manager, priority placement, and custom package pricing.', 'strategy', 20),
('lead-intake', 'budget_timeline', 'timeline', '{"timeline": "immediately"}', 'Urgent Timeline - Strike Fast', 'Client wants to move now. Skip lengthy discovery. Get them to the order/contract stage within 48 hours.', 'strategy', 20),

-- Lead Intake - Decision Authority
('lead-intake', 'decision_authority', 'is_decision_maker', '{"is_decision_maker": false}', 'Not the Decision Maker', 'Ask: "Who else needs to sign off?" Get their name/title. Offer to include them on a brief call.', 'risk', 18),

-- Location Intake - Placement
('location-intake', 'placement_details', 'machine_count', '{"machine_count_gte": 5}', 'Volume Placement - Priority Queue', 'Placing 5+ machines qualifies for bulk location pricing and priority scouting. Mention this benefit.', 'upsell', 18),
('location-intake', 'placement_details', NULL, '{}', 'Location Type Matters', 'Offices/hospitals = highest revenue per machine. Apartments = volume play. Match expectations to placement type.', 'strategy', 10),

-- Location Intake - Restrictions
('location-intake', 'restrictions', NULL, '{}', 'Document All Restrictions Early', 'Any dietary, brand, or location restrictions must be captured now. Mismatches are the #1 cause of placement failure.', 'risk', 15),

-- Location Intake - Agreement
('location-intake', 'agreement_prep', NULL, '{"has_w9": false}', 'Missing W9 - Potential Blocker', 'No W9 means we cannot process placement. Guide them to IRS W9 form or offer our compliance service ($199).', 'risk', 20),
('location-intake', 'agreement_prep', NULL, '{"has_insurance": false}', 'No Insurance - Upsell Opportunity', 'Required for most locations. Offer our vending insurance partner ($49/mo per location). Easy add-on.', 'upsell', 15)

ON CONFLICT DO NOTHING;
