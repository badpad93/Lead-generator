-- ═════════════════════════════════════════════════════════════════════
-- 143 — Completed SBA application PDF return path
-- ─────────────────────────────────────────────────────────────────────
-- Pre-qualified applicants receive the UMSB SBA application PDF by
-- email. This migration adds the return-path storage so they can
-- upload the completed PDF back through the site instead of emailing
-- it. Track where it lives, when it landed, and where it was
-- reviewed from (so admin can audit).
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE public.financing_applications
  ADD COLUMN IF NOT EXISTS completed_pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS completed_pdf_uploaded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS completed_pdf_original_name text,
  ADD COLUMN IF NOT EXISTS completed_pdf_size_bytes   bigint;

-- Private bucket — service role reads/writes only, applicants upload
-- through the API endpoint.
INSERT INTO storage.buckets (id, name, public)
VALUES ('financing-completed-applications', 'financing-completed-applications', false)
ON CONFLICT (id) DO NOTHING;
