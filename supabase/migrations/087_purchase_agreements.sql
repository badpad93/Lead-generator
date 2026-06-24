-- Migration: 087_purchase_agreements
-- Description: VendEra AI Machine Purchase & Services Agreement tables
-- Created: 2026-06-24

-- =============================================================================
-- 1. purchase_agreements — Main agreement record
-- =============================================================================
CREATE TABLE IF NOT EXISTS purchase_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
  account_id UUID,
  operator_id UUID,
  created_by UUID,

  -- Status tracking
  agreement_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (agreement_status IN ('draft','generated','sent','viewed','partially_signed','signed','cancelled','expired')),
  agreement_type TEXT NOT NULL DEFAULT 'machine_purchase',
  template_version INTEGER DEFAULT 1,

  -- Access token for operator signing
  sign_token UUID DEFAULT gen_random_uuid(),

  -- Operator / Buyer info
  operator_company_name TEXT,
  operator_legal_name TEXT,
  operator_email TEXT,
  operator_phone TEXT,
  operator_billing_address TEXT,
  operator_delivery_address TEXT,
  operator_title TEXT,

  -- Apex info
  apex_company_name TEXT DEFAULT 'Apex AI Vending LLC',
  apex_representative_name TEXT,
  apex_representative_title TEXT,
  apex_representative_email TEXT,

  -- Equipment
  machine_model TEXT DEFAULT 'VendEra AI Smart Vending Machine',
  machine_quantity INTEGER DEFAULT 1,
  machine_unit_price NUMERIC(12,2) DEFAULT 3700.00,
  equipment_subtotal NUMERIC(12,2) DEFAULT 3700.00,
  machine_notes TEXT,

  -- Location services
  locations_purchased INTEGER DEFAULT 0,
  location_fee_per_secured NUMERIC(12,2) DEFAULT 400.00,
  max_location_service_value NUMERIC(12,2) DEFAULT 0,
  location_rejection_allowance TEXT DEFAULT 'Greater of 10 locations total or 1 per purchased machine',
  location_service_timeline_days INTEGER DEFAULT 180,
  location_payment_terms TEXT DEFAULT 'Due within 5 business days of invoice',

  -- Shipping / Freight
  standard_freight_rate NUMERIC(12,2) DEFAULT 500.00,
  discounted_freight_rate NUMERIC(12,2) DEFAULT 375.00,
  freight_per_machine NUMERIC(12,2) DEFAULT 375.00,
  freight_total NUMERIC(12,2) DEFAULT 375.00,
  shipping_notes TEXT,
  storage_fee_per_machine_month NUMERIC(12,2) DEFAULT 50.00,
  free_storage_months INTEGER DEFAULT 12,

  -- Payment
  total_due_prior_to_procurement NUMERIC(12,2) DEFAULT 0,
  payment_due_date DATE,
  payment_method_notes TEXT,

  -- Agreement settings
  effective_date DATE DEFAULT CURRENT_DATE,
  governing_state TEXT DEFAULT 'Texas',
  venue_state TEXT DEFAULT 'Texas',
  contract_expiration_date DATE,
  internal_notes TEXT,
  customer_notes TEXT,

  -- Custom legal overrides (JSON for any section text overrides)
  legal_overrides JSONB DEFAULT '{}',

  -- File storage
  pdf_url TEXT,
  signed_pdf_url TEXT,

  -- Timestamps
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  operator_signed_at TIMESTAMPTZ,
  apex_signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 2. agreement_signatures — Actual signature data per signer
-- =============================================================================
CREATE TABLE IF NOT EXISTS agreement_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES purchase_agreements(id) ON DELETE CASCADE,
  signer_type TEXT NOT NULL CHECK (signer_type IN ('operator','apex')),
  signer_name TEXT NOT NULL,
  signer_company TEXT,
  signer_title TEXT,
  signer_email TEXT,
  signature_data TEXT NOT NULL,  -- base64 image or typed signature
  signature_type TEXT DEFAULT 'typed' CHECK (signature_type IN ('typed','drawn')),
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 3. agreement_initials — Section-level initials
-- =============================================================================
CREATE TABLE IF NOT EXISTS agreement_initials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES purchase_agreements(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  signer_type TEXT NOT NULL CHECK (signer_type IN ('operator','apex')),
  initials_data TEXT NOT NULL,
  initialed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agreement_id, section_key, signer_type)
);

-- =============================================================================
-- 4. agreement_activity_log — Audit trail for all actions
-- =============================================================================
CREATE TABLE IF NOT EXISTS agreement_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES purchase_agreements(id) ON DELETE CASCADE,
  user_id UUID,
  activity_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_purchase_agreements_order_id
  ON purchase_agreements(order_id);

CREATE INDEX IF NOT EXISTS idx_purchase_agreements_account_id
  ON purchase_agreements(account_id);

CREATE INDEX IF NOT EXISTS idx_purchase_agreements_operator_id
  ON purchase_agreements(operator_id);

CREATE INDEX IF NOT EXISTS idx_purchase_agreements_sign_token
  ON purchase_agreements(sign_token);

CREATE INDEX IF NOT EXISTS idx_purchase_agreements_status
  ON purchase_agreements(agreement_status);

CREATE INDEX IF NOT EXISTS idx_agreement_signatures_agreement_id
  ON agreement_signatures(agreement_id);

CREATE INDEX IF NOT EXISTS idx_agreement_initials_agreement_id
  ON agreement_initials(agreement_id);

CREATE INDEX IF NOT EXISTS idx_agreement_activity_log_agreement_id
  ON agreement_activity_log(agreement_id);

-- =============================================================================
-- Row Level Security — service_role only
-- =============================================================================
ALTER TABLE purchase_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_initials ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_activity_log ENABLE ROW LEVEL SECURITY;

-- purchase_agreements
CREATE POLICY "Service role full access on purchase_agreements"
  ON purchase_agreements
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- agreement_signatures
CREATE POLICY "Service role full access on agreement_signatures"
  ON agreement_signatures
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- agreement_initials
CREATE POLICY "Service role full access on agreement_initials"
  ON agreement_initials
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- agreement_activity_log
CREATE POLICY "Service role full access on agreement_activity_log"
  ON agreement_activity_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
