-- Ensure the 'documents' storage bucket exists for sales CRM uploads.
-- Public so getPublicUrl() works; tighten later if needed.
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to upload + read objects in this bucket
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'documents_authenticated_insert'
  ) THEN
    CREATE POLICY documents_authenticated_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'documents_authenticated_select'
  ) THEN
    CREATE POLICY documents_authenticated_select
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'documents_public_select'
  ) THEN
    CREATE POLICY documents_public_select
      ON storage.objects FOR SELECT TO anon
      USING (bucket_id = 'documents');
  END IF;
END $$;
