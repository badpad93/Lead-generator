import type { NextRequest } from "next/server";

/**
 * Durable storefront BRANDING context cookie (never authorization).
 *
 * vc_sf_ctx remembers the last storefront slug a visitor was provably
 * associated with — landing on /coffee/o/{slug} or hitting an auth
 * page with ?storefront={slug}. The middleware reads it back so the
 * operator's brand survives the login bounce, the reset email, and the
 * OAuth round-trip. The value is a public slug: it only ever selects a
 * logo/colors and is never trusted for access decisions.
 *
 * Kept dependency-free (type-only NextRequest import) so it is safe to
 * pull into the middleware bundle.
 */
export const SF_CTX_COOKIE = "vc_sf_ctx";
export const SF_CTX_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const SF_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$/; // mirrors the DB slug CHECK

/** Slug this request associates the visitor with, if any (branding only). */
export function storefrontCtxSlug(req: NextRequest): string | null {
  const param = req.nextUrl.searchParams.get("storefront");
  if (param && SF_SLUG_RE.test(param)) return param;
  const m = req.nextUrl.pathname.match(/^\/coffee\/o\/([^/]+)/);
  if (m) {
    try {
      const slug = decodeURIComponent(m[1]);
      if (SF_SLUG_RE.test(slug)) return slug;
    } catch {
      /* malformed escape — ignore */
    }
  }
  return null;
}

/** Validated durable-context slug already stored in the cookie, if any. */
export function storedCtxSlug(req: NextRequest): string | null {
  const v = req.cookies.get(SF_CTX_COOKIE)?.value;
  return v && SF_SLUG_RE.test(v) ? v : null;
}
