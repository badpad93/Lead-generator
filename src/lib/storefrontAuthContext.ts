/**
 * Durable storefront auth context (server-side).
 *
 * Auth branding used to live in a single `?storefront={slug}` query
 * param, resolved client-side. That param is dropped by every path
 * that reissues a URL without carrying it — the middleware login
 * bounce, Supabase's password-reset email, the OAuth round-trip —
 * so an invited coffee customer would lose their operator's identity
 * mid-flow and fall back to generic "Vending Connector" chrome.
 *
 * This module makes the operator context DURABLE and SERVER-RESOLVED:
 *
 *   - A `vc_sf_ctx` cookie remembers the last storefront slug the
 *     visitor was associated with (set when they land on a branded
 *     storefront or an auth page that carries ?storefront=).
 *   - `resolveAuthBrand()` resolves the active slug with a fixed
 *     precedence and fetches the operator's public brand ON THE
 *     SERVER, so auth screens render already-branded (no client
 *     fetch flash, no lost context).
 *
 * SECURITY: the slug and the cookie are BRANDING ONLY. They never
 * grant access to anything. Every real authorization / data-isolation
 * decision continues to flow from the authenticated profile and its
 * DB relationships (RLS + the middleware customer-lock). A visitor
 * who forges `?storefront=` or `vc_sf_ctx` only changes which logo
 * and colors they see on a public auth page — the same page an
 * anonymous visitor can already reach.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantBySlug, isValidSlug } from "@/lib/storefront/tenants";
import { previewInvitationByToken } from "@/lib/storefront/enrollment";

/**
 * Client-stashed invite token cookie (mirrors INVITE_TOKEN_KEY in
 * lib/auth.ts). Read here so a signup that lost its ?storefront= can
 * still resolve branding from the invitation it carries.
 */
const INVITE_TOKEN_COOKIE = "vc_storefront_invite_token";

export const SF_CTX_COOKIE = "vc_sf_ctx";
/** 30 days — long enough to survive an email round-trip, short enough to age out. */
export const SF_CTX_MAX_AGE = 60 * 60 * 24 * 30;

export interface AuthBrand {
  slug: string;
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
}

/** Minimal cookie accessor — matches Next's `cookies()` store and is trivially mockable in tests. */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/**
 * First syntactically-valid slug from an ordered candidate list.
 * Pure — no I/O — so the precedence rule is unit-testable on its own.
 */
export function pickSlug(candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (c && isValidSlug(c)) return c;
  }
  return null;
}

/**
 * Guard for the post-auth `redirect=` param and any slug-derived
 * redirect: only same-origin, path-absolute targets are allowed, so
 * a crafted `redirect=//evil.com` or `redirect=https://evil.com`
 * can never turn an auth page into an open redirect.
 */
export function isSafeRelativePath(path: string | null | undefined): boolean {
  if (!path) return false;
  // Must start with a single "/", and must NOT start with "//" or "/\"
  // (protocol-relative) or contain a scheme.
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  return true;
}

/** `/coffee/o/{slug}` — only when the slug is well-formed, else null. */
export function storefrontHomePath(slug: string | null | undefined): string | null {
  return slug && isValidSlug(slug) ? `/coffee/o/${slug}` : null;
}

/** Read + validate the durable context slug from the cookie store. */
export function readSfCtxSlug(cookies: CookieReader): string | null {
  const raw = cookies.get(SF_CTX_COOKIE)?.value;
  return raw && isValidSlug(raw) ? raw : null;
}

/** Cookie options for stamping the durable context. Branding-only, so not httpOnly. */
export function sfCtxCookieOptions() {
  return {
    path: "/",
    maxAge: SF_CTX_MAX_AGE,
    sameSite: "lax" as const,
    // Deliberately NOT httpOnly: the value is a public slug, and
    // client hydration helpers may read it. It is never trusted for
    // authorization.
    httpOnly: false,
  };
}

/** Fetch a tenant's public brand, server-side. Approved tenants only. */
export async function fetchAuthBrand(slug: string | null | undefined): Promise<AuthBrand | null> {
  if (!slug || !isValidSlug(slug)) return null;
  try {
    const tenant = await resolveTenantBySlug(slug);
    if (!tenant || tenant.status !== "approved") return null;
    const brand = tenant.brand ?? {};
    return {
      slug: tenant.slug,
      display_name: tenant.display_name,
      logo_url: (brand.logo_url as string) || null,
      primary_color: (brand.primary_color as string) || "#1a1a1a",
      accent_color: (brand.accent_color as string) || "#c4a877",
    };
  } catch {
    return null;
  }
}

/** Derive a slug from a stashed invite token cookie (best-effort). */
async function inviteTokenSlug(cookies: CookieReader): Promise<string | null> {
  const token = cookies.get(INVITE_TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    const preview = await previewInvitationByToken(token);
    const slug = preview?.tenant?.slug;
    return slug && isValidSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the active storefront slug for an auth screen.
 * Precedence (highest first):
 *   1. explicit ?storefront= (or signup's ?invite_token= slug)
 *   2. stashed invite token cookie
 *   3. durable vc_sf_ctx cookie
 *   4. the authenticated user's own storefront binding
 * Returns null → generic (Vending Connector) branding.
 */
export async function resolveAuthSlug(opts: {
  paramSlug?: string | null;
  cookies: CookieReader;
  userTenantSlug?: string | null;
}): Promise<string | null> {
  const { paramSlug, cookies, userTenantSlug } = opts;
  const direct = pickSlug([paramSlug]);
  if (direct) return direct;
  const invite = await inviteTokenSlug(cookies);
  if (invite) return invite;
  const ctx = readSfCtxSlug(cookies);
  if (ctx) return ctx;
  return pickSlug([userTenantSlug]);
}

/**
 * One-call resolver for server auth pages: figure out the slug and
 * return its brand (or null for generic). `userTenantSlug` is the
 * caller-supplied slug for the signed-in user, when known.
 */
export async function resolveAuthBrand(opts: {
  paramSlug?: string | null;
  cookies: CookieReader;
  userTenantSlug?: string | null;
}): Promise<AuthBrand | null> {
  const slug = await resolveAuthSlug(opts);
  return fetchAuthBrand(slug);
}

/**
 * Slug for the signed-in user's storefront, resolved via service role
 * from a bare user id (used by callers that already know the id).
 */
export async function tenantSlugForUser(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("storefront_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = (prof as { storefront_tenant_id?: string | null } | null)?.storefront_tenant_id;
    if (!tenantId) return null;
    const { data: tenant } = await supabaseAdmin
      .from("storefront_tenants")
      .select("slug")
      .eq("id", tenantId)
      .maybeSingle();
    const slug = (tenant as { slug?: string } | null)?.slug;
    return slug && isValidSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}
