-- Migration 042: Create missing storage buckets with RLS policies
-- sales-documents: used by candidates, pipeline items, team docs, intake uploads, esign PDFs
-- document-templates: used by onboarding document template admin

-- ============================================================
-- 1. SALES-DOCUMENTS BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('sales-documents', 'sales-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'sales_documents_authenticated_insert'
  ) THEN
    CREATE POLICY sales_documents_authenticated_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'sales-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'sales_documents_authenticated_select'
  ) THEN
    CREATE POLICY sales_documents_authenticated_select
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'sales-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'sales_documents_public_select'
  ) THEN
    CREATE POLICY sales_documents_public_select
      ON storage.objects FOR SELECT TO anon
      USING (bucket_id = 'sales-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'sales_documents_service_role_all'
  ) THEN
    CREATE POLICY sales_documents_service_role_all
      ON storage.objects FOR ALL TO service_role
      USING (bucket_id = 'sales-documents')
      WITH CHECK (bucket_id = 'sales-documents');
  END IF;
END $$;

-- ============================================================
-- 2. DOCUMENT-TEMPLATES BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('document-templates', 'document-templates', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'doc_templates_authenticated_insert'
  ) THEN
    CREATE POLICY doc_templates_authenticated_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'document-templates');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'doc_templates_authenticated_select'
  ) THEN
    CREATE POLICY doc_templates_authenticated_select
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'document-templates');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'doc_templates_public_select'
  ) THEN
    CREATE POLICY doc_templates_public_select
      ON storage.objects FOR SELECT TO anon
      USING (bucket_id = 'document-templates');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'doc_templates_service_role_all'
  ) THEN
    CREATE POLICY doc_templates_service_role_all
      ON storage.objects FOR ALL TO service_role
      USING (bucket_id = 'document-templates')
      WITH CHECK (bucket_id = 'document-templates');
  END IF;
END $$;
