-- Migration 131: profile avatar + business logo
--
-- Two columns on `profiles`:
--   avatar_url — personal photo shown next to the user's name
--   logo_url   — business logo (for operators / companies)
--
-- Both are optional text URLs pointing into the new `profile-media`
-- storage bucket. Anywhere the account has "an image" (avatar or
-- logo), it's rendered from these columns.
--
-- Storage bucket is PUBLIC read so the URLs work in any <img> tag
-- without signed-URL round-trips. Writes go through the API which
-- runs as service_role, so we don't need per-object owner RLS —
-- the client can't upload directly.

-- ── Columns ───────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS logo_url   text;

COMMENT ON COLUMN public.profiles.avatar_url IS
  'Public URL of the user''s personal photo. Managed via /api/account/media.';
COMMENT ON COLUMN public.profiles.logo_url IS
  'Public URL of the account''s business logo. Managed via /api/account/media.';

-- ── Storage bucket ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-media', 'profile-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── Storage RLS ───────────────────────────────────────────────────
-- Writes are gated to service_role only (the /api/account/media
-- route enforces per-user ownership before proxying to storage).
-- Reads are open to both authenticated and anonymous clients so an
-- <img src={profile.avatar_url}> works everywhere with no auth.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'profile_media_service_role_all'
  ) THEN
    CREATE POLICY profile_media_service_role_all
      ON storage.objects FOR ALL TO service_role
      USING (bucket_id = 'profile-media')
      WITH CHECK (bucket_id = 'profile-media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'profile_media_public_select'
  ) THEN
    CREATE POLICY profile_media_public_select
      ON storage.objects FOR SELECT TO anon
      USING (bucket_id = 'profile-media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'profile_media_authenticated_select'
  ) THEN
    CREATE POLICY profile_media_authenticated_select
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'profile-media');
  END IF;
END $$;
