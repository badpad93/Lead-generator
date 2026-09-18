import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Career résumés live in the PRIVATE `career-resumes` bucket (applicant PII),
 * so `job_applications.resume_url` now stores the object KEY, not a public URL.
 * Admins view résumés through short-lived signed URLs minted server-side.
 *
 * Legacy applications stored a full public URL (the old `documents` bucket).
 * Those pass through unchanged, so no data migration is needed — we only sign
 * values that look like a bare storage key.
 */
export const RESUME_BUCKET = "career-resumes";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — long enough to review

/** A stored value is already a URL (legacy public résumé) if it's http(s). */
function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Resolve a stored résumé reference to something an admin can open:
 * - null/empty → null
 * - a legacy absolute URL → returned unchanged
 * - a private object key → a short-lived signed URL (or null if signing fails)
 */
export async function resolveResumeUrl(
  storedValue: string | null | undefined,
): Promise<string | null> {
  if (!storedValue) return null;
  if (isAbsoluteUrl(storedValue)) return storedValue;

  const { data, error } = await supabaseAdmin.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(storedValue, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Replace `resume_url` on each application with a viewable (signed) URL. */
export async function withSignedResumeUrls<T extends { resume_url?: string | null }>(
  applications: T[],
): Promise<T[]> {
  return Promise.all(
    applications.map(async (app) => ({
      ...app,
      resume_url: await resolveResumeUrl(app.resume_url),
    })),
  );
}
