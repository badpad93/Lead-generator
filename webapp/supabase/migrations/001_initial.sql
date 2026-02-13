-- Lead Generator Schema
-- Run this in your Supabase SQL Editor

-- 1) runs table
CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  state text NOT NULL,
  radius_miles int NOT NULL DEFAULT 50,
  max_leads int NOT NULL DEFAULT 500,
  industries text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  progress jsonb NOT NULL DEFAULT '{"total":0,"message":"Queued"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) leads table
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  industry text,
  business_name text,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  website text,
  employee_count int,
  customer_count int,
  decision_maker text,
  contacted_date date,
  notes text,
  source_url text,
  distance_miles numeric,
  confidence numeric,
  -- normalized fields for dedup
  normalized_domain text GENERATED ALWAYS AS (
    lower(trim(
      regexp_replace(
        regexp_replace(coalesce(website, ''), '^https?://(www\.)?', ''),
        '/.*$', ''
      )
    ))
  ) STORED,
  normalized_phone text GENERATED ALWAYS AS (
    regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
  ) STORED,
  normalized_name text GENERATED ALWAYS AS (
    lower(regexp_replace(coalesce(business_name, ''), '[^a-zA-Z0-9]', '', 'g'))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_run_id ON leads(run_id);
CREATE INDEX IF NOT EXISTS idx_leads_industry ON leads(industry);

-- Dedupe index: unique per run on normalized fields
-- Uses a composite to catch duplicates by domain+phone, or name+zip when those are empty
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_dedupe
  ON leads(run_id, normalized_name, coalesce(nullif(normalized_domain, ''), '_none_'), coalesce(nullif(normalized_phone, ''), '_none_'), coalesce(nullif(zip, ''), '_none_'));

-- 3) Geocode cache table (optional)
CREATE TABLE IF NOT EXISTS geocode_cache (
  address_key text PRIMARY KEY,
  lat numeric,
  lng numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Function to auto-update updated_at on runs
CREATE OR REPLACE FUNCTION update_runs_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_runs_updated_at
  BEFORE UPDATE ON runs
  FOR EACH ROW
  EXECUTE FUNCTION update_runs_updated_at();
