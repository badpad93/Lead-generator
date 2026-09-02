-- Public Supabase Storage bucket for storefront brand assets
-- (logos + favicons uploaded by tenant owners or admins on behalf
-- of a tenant).
--
-- Public read is required — the branded storefront page at
-- /coffee/o/{slug} is anonymous, so the customer's browser must
-- be able to fetch the logo/favicon URL without a session.
--
-- Write is service-role only. The upload API route
-- (POST /api/storefront/tenant/brand-asset) authorizes the caller
-- as either the tenant owner OR an admin, then writes through
-- supabaseAdmin. No client-direct upload path — that would leak
-- the ability to overwrite another tenant's brand asset since the
-- Storage RLS can't easily reason about the path prefix.
--
-- Object keys follow: {tenant_id}/{asset_type}-{timestamp}.{ext}
--   e.g. 8f9b2c…/logo-1735234567123.png
--       8f9b2c…/favicon-1735234567123.ico
-- Timestamped so a re-upload never collides in the CDN URL cache;
-- the API removes the previous object after a successful save.
--
-- Idempotent — INSERT ... ON CONFLICT, DO ... IF NOT EXISTS.

INSERT INTO storage.buckets (id, name, public)
VALUES ('storefront-brand', 'storefront-brand', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'storefront_brand_public_select'
  ) THEN
    CREATE POLICY storefront_brand_public_select
      ON storage.objects FOR SELECT TO anon, authenticated
      USING (bucket_id = 'storefront-brand');
  END IF;

  -- No client INSERT/UPDATE/DELETE policies — writes go through
  -- the service-role API only, which does the tenant-ownership
  -- authorization itself.
END $$;

COMMENT ON TABLE storage.buckets IS
  '…storefront-brand: public bucket holding logo + favicon uploads for storefront_tenants. Writes gated by /api/storefront/tenant/brand-asset (owner OR admin). Reads are unauthenticated so /coffee/o/{slug} anonymous visitors get the images.';
