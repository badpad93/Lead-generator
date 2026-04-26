-- Migration 041: Location Pricing Engine
-- Adds pricing score/tier/price columns and input fields to locations table

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS pricing_score INT,
  ADD COLUMN IF NOT EXISTS pricing_tier INT,
  ADD COLUMN IF NOT EXISTS pricing_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pricing_calculated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS business_hours TEXT,
  ADD COLUMN IF NOT EXISTS machines_requested INT;
