-- Private storage bucket for career résumés (applicant PII).
--
-- Résumés previously went into the public-read `documents` bucket, so anyone
-- with the URL could read an applicant's résumé. This bucket is PRIVATE
-- (public = false): objects are never served at a public URL. Uploads and
-- reads happen only through the service role (which bypasses RLS) in the
-- careers upload route and the admin listing route, and admins view résumés
-- through short-lived signed URLs minted server-side.
--
-- No anon/authenticated storage policies are created — there is intentionally
-- NO public or client access to this bucket. Existing résumés already stored
-- in `documents` keep working (the admin route passes their public URLs
-- through unchanged); only new uploads land here.

INSERT INTO storage.buckets (id, name, public)
VALUES ('career-resumes', 'career-resumes', false)
ON CONFLICT (id) DO UPDATE SET public = false;
